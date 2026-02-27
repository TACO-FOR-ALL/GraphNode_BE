import { ulid } from 'ulid';

import { MicroscopeWorkspaceMetaDoc, MicroscopeDocumentMetaDoc } from '../types/persistence/microscope_workspace.persistence';
import { MicroscopeWorkspaceStore } from '../ports/MicroscopeWorkspaceStore';
import { GraphNeo4jStore } from '../ports/GraphNeo4jStore';
import { QueuePort } from '../ports/QueuePort';
import { StoragePort } from '../ports/StoragePort';
import { TaskType, MicroscopeIngestQueuePayload } from '../../shared/dtos/queue';
import { UpstreamError, NotFoundError, ForbiddenError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

/**
 * Microscope 기능(지식 그래프 분석, RAG 파이프라인)의 전반적인 메타데이터 관리와 작업 요청을 조율하는 서비스 객체.
 * 
 * - S3 파일 업로드 및 관리
 * - MongoDB 워크스페이스 상태 추적 (PENDING, COMPLETED 등)
 * - SQS 작업(Job) 비동기 통신
 * - 삭제 시 Neo4j 그래프와 메타데이터의 생명주기를 맞춰주는 트랜잭셔널 작업 수행
 */
export class MicroscopeManagementService {
  private readonly jobQueueUrl: string;

  /**
   * 의존성 주입(DI).
   * @param microscopeWorkspaceStore MongoDB 저장소 포트. 문서 진행 상태(메타데이터) 보관을 담당합니다.
   * @param graphNeo4jStore Neo4j 저장소 포트. 실제 지식 그래프(Entity/Chunk/Relation) 보관을 담당합니다.
   * @param queuePort 비동기 워커 통신을 위한 AWS SQS 포트.
   * @param storagePort 파일 업로드를 위한 AWS S3 스토리지 포트.
   */
  constructor(
    private readonly microscopeWorkspaceStore: MicroscopeWorkspaceStore,
    private readonly graphNeo4jStore: GraphNeo4jStore,
    private readonly queuePort: QueuePort,
    private readonly storagePort: StoragePort,
  ) {
    // SQS Request URL for AI tasks (Microscope 워커 요청 큐)
    this.jobQueueUrl = process.env.SQS_REQUEST_QUEUE_URL || 'TO_BE_CONFIGURED';
  }

  /**
   * 새로운 Microscope 워크스페이스(그룹)를 생성합니다.
   * 
   * @param userId 생성 요청 유저 ID
   * @param name 워크스페이스 이름
   * @returns 생성된 워크스페이스의 메타데이터 문서
   * @throws {UpstreamError} MICRO_WORKSPACE_CREATE_FAIL MongoDB 인서트 실패 시
   */
  async createWorkspace(userId: string, name: string): Promise<MicroscopeWorkspaceMetaDoc> {
    try {
      const groupId = ulid();
      const now = new Date().toISOString();
      const workspace: MicroscopeWorkspaceMetaDoc = {
        _id: groupId,
        userId,
        name,
        documents: [],
        createdAt: now,
        updatedAt: now,
      };

      await this.microscopeWorkspaceStore.createWorkspace(workspace);
      logger.info({ userId, groupId, name }, 'Created new Microscope workspace');
      return workspace;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to create Microscope workspace');
      throw new UpstreamError('Failed to create Microscope workspace', { cause: String(err) });
    }
  }

  /**
   * 유저의 모든 워크스페이스 목록을 생성일 역순으로 조회합니다.
   * 
   * @param userId 유저 ID
   * @returns 조회가 완료된 워크스페이스 목록
   * @throws {UpstreamError} MICRO_WORKSPACE_LIST_FAIL MongoDB 조회 쿼리 실패 시
   */
  async listWorkspaces(userId: string): Promise<MicroscopeWorkspaceMetaDoc[]> {
    return this.microscopeWorkspaceStore.findByUserId(userId);
  }

  /**
   * 특정 워크스페이스의 상세 정보(업로드된 문서 등) 메타데이터를 조회합니다.
   * 
   * @param userId 유저 ID
   * @param groupId 워크스페이스 ID
   * @returns 특정 워크스페이스 객체 정보
   * @throws {NotFoundError} MICRO_WORKSPACE_NOT_FOUND 해당 groupId의 워크스페이스가 없을 때
   * @throws {ForbiddenError} MICRO_FORBIDDEN 요청 유저가 해당 워크스페이스 소유자가 아닐 때
   */
  async getWorkspaceActivity(userId: string, groupId: string): Promise<MicroscopeWorkspaceMetaDoc> {
    const workspace = await this.microscopeWorkspaceStore.findById(groupId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${groupId} not found`);
    }
    if (workspace.userId !== userId) {
      throw new ForbiddenError('You do not have permission to view this workspace');
    }
    return workspace;
  }

  /**
   * 워크스페이스 삭제.
   * 연관된 모든 Neo4j 지식 그래프 데이터(Entity, Chunk, Edge 등)를 Detach Delete 한 뒤, 메타데이터(Mongo)도 파기합니다.
   * 
   * @param userId 유저 ID
   * @param groupId 삭제할 워크스페이스 식별자
   * @throws {NotFoundError} MICRO_WORKSPACE_NOT_FOUND 해당 groupId가 존재하지 않을 때
   * @throws {ForbiddenError} MICRO_FORBIDDEN 타인의 워크스페이스를 삭제 시도할 때
   * @throws {UpstreamError} 원격 DB 작업 중 하나가 실패했을 때
   * @remarks
   * - Neo4j 데이터를 파기하는 `deleteMicroscopeWorkspaceGraphs` 호출 시, 이 작업은 단일 Cypher 쿼리로써 자체 암시적 트랜잭션을 갖습니다.
   * - Neo4j 삭제 쿼리가 어떠한 이유로 실패(Timeout/네트워크 에러)하면, 에러가 throw 되어 Catch 블록으로 빠집니다.
   * - 이에 따라 다음 줄의 MongoDB 상태 파기 로직은 실행되지 않으므로, 최악의 경우 "삭제가 중간에 취소된 상태"로 보장되어 데이터 원상태가 유지됩니다 (임시적 분산 트랜잭션 안전 보장).
   */
  async deleteWorkspace(userId: string, groupId: string): Promise<void> {
    const workspace = await this.microscopeWorkspaceStore.findById(groupId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${groupId} not found`);
    }
    if (workspace.userId !== userId) {
      throw new ForbiddenError('You do not have permission to delete this workspace');
    }

    try {
      // 1. Neo4j의 관련 노드 및 엣지 전부 파기 (Cascade DETACH DELETE)
      // Neo4j는 쿼리 한 줄(`MATCH ... DETACH DELETE n`)로 진행되므로 이 호출은 통으로 롤백/반영됩니다.
      await this.graphNeo4jStore.deleteMicroscopeWorkspaceGraphs(groupId);
      
      // 2. MongoDB의 상태 메타데이터 파기
      // Neo4j가 먼저 오류를 뱉으면 이 코드는 실행되지 않아 상태 데이터는 무사합니다.
      await this.microscopeWorkspaceStore.deleteWorkspace(groupId);
      
      logger.info({ userId, groupId }, 'Deleted Microscope workspace and its Neo4j graph data');
    } catch (err) {
      logger.error({ err, userId, groupId }, 'Failed to delete Microscope workspace');
      throw new UpstreamError('Failed to delete Microscope workspace', { cause: String(err) });
    }
  }

  /**
   * Microscope Graph 새로운 생성 또는 기존 Graph에 다중 파일 문서 추가 분석 요청.
   * 지정된 워크스페이스에 복수의 문서 버퍼를 인자로 받아 S3 업로드, 메타데이터 기록, SQS INGEST 발행 작업을 일괄 처리합니다.
   * 
   * @param userId 유저 고유 ID (인증자)
   * @param groupId 대상 워크스페이스 ID (사전에 만들어져 있어야 합니다.)
   * @param files S3에 업로드 될 실제 파일 버퍼와 파일명의 배열
   * @param schemaName (선택) 엔티티 추출 제약사항. AI 모델이 참조할 스키마 명칭
   * @returns 상태 변경 추적을 위해 등록된 내부 문서 식별자 목록 객체 배열
   * @throws {NotFoundError} MICRO_WORKSPACE_NOT_FOUND 대상 groupId가 존재하지 않을 때
   * @throws {ForbiddenError} MICRO_FORBIDDEN 요청자가 소유자가 아닐 때
   * @throws {UpstreamError} 파일 업로드 실패, DB 연결 실패, 혹은 큐 인입 실패 시 처리 에러
   * @remarks
   * - 파일의 용량이 클 수 있으므로 각 요소의 상태 변경만 안전하게 배열에 Push합니다 (PENDING).
   * - 실패하더라도 큐 발행이 안 된 것일 뿐 개별 처리 모듈로 분산되므로 Mongo에는 남아 잉여 데이터가 남을 수 있습니다(크론 잡을 통한 재시도 지원 가능).
   */
  async addDocumentsToExistingWorkspace(
    userId: string,
    groupId: string,
    files: { buffer: Buffer; fileName: string; mimeType: string }[],
    schemaName?: string
  ): Promise<MicroscopeDocumentMetaDoc[]> {
    const workspace = await this.microscopeWorkspaceStore.findById(groupId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${groupId} not found`);
    }
    if (workspace.userId !== userId) {
      throw new ForbiddenError('You do not have permission to add documents to this workspace');
    }

    const payloadBucket = process.env.S3_PAYLOAD_BUCKET || 'graph-node-payloads';
    const addedDocs: MicroscopeDocumentMetaDoc[] = [];

    for (const file of files) {
      const docId = `task_microscope_add_document_${userId}_${ulid()}`;
      const now = new Date().toISOString();
      // 유니크한 S3 키 생성
      const s3Key = `microscope/${userId}/${groupId}/${docId}_${file.fileName}`;

      const newDocument: MicroscopeDocumentMetaDoc = {
        id: docId,
        s3Key,
        fileName: file.fileName,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };

      try {
        // 1. S3 업로드
        await this.storagePort.upload(s3Key, file.buffer, file.mimeType, { bucketType: 'payload' });
        
        // 2. MongoDB 상태 트리커 등록 (PENDING 상태)
        await this.microscopeWorkspaceStore.addDocument(groupId, newDocument);

        // 3. AI 서버 처리를 위한 SQS 큐 발송
        const messageBody: MicroscopeIngestQueuePayload = {
          taskId: docId, // 문서 처리 고유 ID를 Correlation ID로 활용
          taskType: TaskType.MICROSCOPE_INGEST_REQUEST,
          payload: {
            user_id: userId,
            group_id: groupId,
            s3_key: s3Key,
            bucket: payloadBucket,
            file_name: file.fileName,
            schema_name: schemaName,
          },
          timestamp: new Date().toISOString(),
        };

        await this.queuePort.sendMessage(this.jobQueueUrl, messageBody);
        
        addedDocs.push(newDocument);
        logger.info({ userId, groupId, s3Key, taskId: docId }, 'Enqueued Microscope Ingest Task via SQS');
      } catch (err) {
        // 업로드 또는 SQS 실패 시 다음 파일을 계속 처리할지, 즉시 Throw할지 설계 선택: 통상 단건 롤백이 불가하므로 예외를 발생시킵니다.
        logger.error({ err, userId, groupId, s3Key }, 'Failed to add a particular document to Microscope workspace');
        throw new UpstreamError(`Failed to process document ${file.fileName}`, { cause: String(err) });
      }
    }

    return addedDocs;
  }

  /**
   * 한 번에 워크스페이스를 신규 생성하고 문서를 다중 첨부 분석하는 통합 Convenience 함수.
   * 
   * @param userId 요청 유저
   * @param workspaceName 생성할 워크스페이스 제목명
   * @param files 분석할 파일 버퍼 배열
   * @param schemaName 추출 스키마명
   * @returns 워크스페이스 전체 메타데이터
   * @remarks 성공적으로 등록된 직후의 워크스페이스 상태(PENDING)들을 즉시 리턴합니다.
   */
  async createWorkspaceWithDocuments(
    userId: string,
    workspaceName: string,
    files: { buffer: Buffer; fileName: string; mimeType: string }[],
    schemaName?: string
  ): Promise<MicroscopeWorkspaceMetaDoc> {
    const workspace = await this.createWorkspace(userId, workspaceName);
    const addedDocs = await this.addDocumentsToExistingWorkspace(userId, workspace._id, files, schemaName);
    
    // 리턴 결과물 병합 (메모리상)
    workspace.documents = addedDocs;
    return workspace;
  }

  /**
   * 워크스페이스 내 특정 문서의 진행 상태를 갱신합니다. (Worker -> API 통신 시 사용)
   * 
   * @param userId 유저 ID (소유권 확인용 - SQS 페이로드 기준)
   * @param groupId 워크스페이스 ID
   * @param docId 상태를 변경할 대상 문서의 고유 ID
   * @param status 변경될 최종 상태 (COMPLETED, FAILED 등)
   * @param sourceId (옵션) 파싱 성공 시 발행된 Neo4j Source Node ID
   * @param error (옵션) 실패 시 반환받은 에러 메시지
   * @returns 상태 변경이 반영된 최신화된 전체 워크스페이스 객체를 반환합니다.
   * @throws {NotFoundError} 워크스페이스가 없거나 docId가 존재하지 않을 때
   * @throws {ForbiddenError} 권한 부족 시
   * @remarks
   * - MongoDB의 위치 지정 연산자(`$`)를 참고하기 위해 Repository의 `updateDocumentStatus`를 호출합니다.
   * - 동작 원리: `updateOne({ _id: groupId, 'documents.id': docId }, { $set: { 'documents.$.status': status } })`와 같은 쿼리가 실행되어 
   *   해당 docId를 가진 특정 배열 내역(원소) 1개만을 정확하게 업데이트합니다. 다른 파일들의 진행 상황은 유지(Atomic update)됩니다.
   */
  async updateDocumentStatus(
    userId: string,
    groupId: string,
    docId: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    sourceId?: string,
    error?: string,
  ): Promise<MicroscopeWorkspaceMetaDoc> {
    const workspace = await this.microscopeWorkspaceStore.findById(groupId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${groupId} not found`);
    }
    // SQS에서 날아온 데이터가 정말 워크스페이스 소유자인지 검증.
    if (workspace.userId !== userId) {
      throw new ForbiddenError('You do not have permission to modify this workspace');
    }

    try {
      await this.microscopeWorkspaceStore.updateDocumentStatus(groupId, docId, status, sourceId, error);
      logger.info({ userId, groupId, docId, status }, `Microscope document status updated to ${status}`);
      
      // 업데이트 후 최신 상태 반환 (Handler에서 전체 문서 중 마지막인지 여부 파악 용도)
      const updatedWorkspace = await this.microscopeWorkspaceStore.findById(groupId);
      return updatedWorkspace as MicroscopeWorkspaceMetaDoc;
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      logger.error({ err, userId, groupId, docId }, 'Failed to update document status');
      throw new UpstreamError('Failed to update document status', { cause: String(err) });
    }
  }
}
