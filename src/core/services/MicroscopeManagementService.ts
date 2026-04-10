import { ulid } from 'ulid';
import { MongoClient, ClientSession } from 'mongodb';

import { getMongo } from '../../infra/db/mongodb';
import { AppError } from '../../shared/errors/base';
import {
  MicroscopeWorkspaceMetaDoc,
  MicroscopeDocumentMetaDoc,
  MicroscopeGraphPayloadDoc,
  MicroscopeGraphNodeDoc,
  MicroscopeGraphEdgeDoc,
  MicroscopeDocumentStatus,
} from '../types/persistence/microscope_workspace.persistence';
import { MicroscopeWorkspaceStore } from '../ports/MicroscopeWorkspaceStore';
import { GraphNeo4jStore } from '../ports/GraphNeo4jStore';
import { QueuePort } from '../ports/QueuePort';
import { StoragePort } from '../ports/StoragePort';
import { MicroscopeGraphDataDto } from '../../shared/dtos/microscope';
import { TaskType } from '../../shared/dtos/queue';
import {
  UpstreamError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';
import { ConversationRepository } from '../ports/ConversationRepository';
import { NoteRepository } from '../ports/NoteRepository';
import { NotificationService } from './NotificationService';
import { AiMicroscopeIngestResultItem } from '../../shared/dtos/ai_graph_output';
import { withRetry } from '../../shared/utils/retry';

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
   * @param conversationRepo Conversation 조회를 위한 레포지토리.
   * @param noteRepo Note 조회를 위한 레포지토리.
   */
  constructor(
    private readonly microscopeWorkspaceStore: MicroscopeWorkspaceStore,
    private readonly graphNeo4jStore: GraphNeo4jStore,
    private readonly queuePort: QueuePort,
    private readonly storagePort: StoragePort,
    private readonly conversationRepo: ConversationRepository,
    private readonly noteRepo: NoteRepository,
    private readonly notificationService: NotificationService
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

    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      // 1. Neo4j의 관련 코드 우선 폐기
      // await this.graphNeo4jStore.deleteMicroscopeWorkspaceGraphs(groupId);

      await withRetry(
        async () => {
          await session.withTransaction(async () => {
            // 2. MongoDB의 상태 메타데이터 파기
            // Neo4j가 먼저 오류를 뱉으면 이 코드는 실행되지 않아 상태 데이터는 무사합니다.
            await this.microscopeWorkspaceStore.deleteWorkspace(groupId, session);

            // 3. MongoDB의 페이로드 연계 데이터들도 파기
            await this.microscopeWorkspaceStore.deleteGraphPayloadsByGroupId(groupId, session);
          });
        },
        { label: 'MicroscopeManagementService.deleteWorkspace.transaction' }
      );

      logger.info(
        { userId, groupId },
        'Deleted Microscope workspace, payloads and its Neo4j graph data'
      );
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
      if (err instanceof AppError) throw err;
      logger.error({ err, userId, groupId }, 'Failed to delete Microscope workspace');
      throw new UpstreamError('Failed to delete Microscope workspace', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Microscope Graph 새로운 생성 분석 요청 (Node 방식).
   * 지정된 노드(Note/Conversation)를 대상으로 SQS INGEST 발행 작업을 처리합니다.
   *
   * @param userId 유저 고유 ID (인증자)
   * @param nodeId 대상 노드 ID (Conversation 또는 Note _id)
   * @param nodeType 노드 타입 ('note' | 'conversation')
   * @param schemaName (선택) 엔티티 추출 제약사항. AI 모델이 참조할 스키마 명칭
   * @returns 생성된 워크스페이스의 메타데이터 전체
   * @throws {NotFoundError} 해당 대상 데이터가 없을 때
   * @throws {ForbiddenError} 권한 불일치
   */
  async createWorkspaceAndMicroscopeIngestFromNode(
    userId: string,
    nodeId: string,
    nodeType: 'note' | 'conversation',
    schemaName?: string
  ): Promise<MicroscopeWorkspaceMetaDoc> {
    // 1. 원본 데이터 검증 및 타이틀 추출
    let workspaceTitle = '';
    if (nodeType === 'note') {
      const note = await this.noteRepo.getNote(nodeId, userId);
      if (!note) {
        throw new NotFoundError(`Note ${nodeId} not found or you do not have permission`);
      }
      workspaceTitle = note.title || `Note ${nodeId}`;
    } else if (nodeType === 'conversation') {
      const conv = await this.conversationRepo.findById(nodeId, userId);
      if (!conv) {
        throw new NotFoundError(`Conversation ${nodeId} not found or you do not have permission`);
      }
      workspaceTitle = conv.title || `Conversation ${nodeId}`;
    } else {
      throw new ValidationError(`Invalid node type: ${nodeType}`);
    }

    // 2. 워크스페이스 신규 생성
    const workspace = await this.createWorkspace(userId, workspaceTitle);
    const groupId = workspace._id;

    const docId = `task_microscope_node_${userId}_${ulid()}`;
    const now = new Date().toISOString();

    const newDocument: MicroscopeDocumentMetaDoc = {
      id: docId,
      s3Key: '', // Node 방식이므로 s3Key 불필요, 빈 문자열 삽입
      fileName: `${nodeId}.md`,
      status: 'PROCESSING',
      nodeId,
      nodeType,
      createdAt: now,
      updatedAt: now,
    };

    try {
      // 3. MongoDB 상태 트리거 등록
      await this.microscopeWorkspaceStore.addDocument(groupId, newDocument);

      // 4. AI 서버 처리를 위한 SQS 큐 발송 (MICROSCOPE_INGEST_FROM_NODE_REQUEST)
      const messageBody = {
        taskId: docId,
        taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_REQUEST,
        payload: {
          user_id: userId,
          node_id: nodeId,
          node_type: nodeType,
          group_id: groupId,
          schema_name: schemaName,
        },
        timestamp: new Date().toISOString(),
      };

      await withRetry(async () => await this.queuePort.sendMessage(this.jobQueueUrl, messageBody), {
        label: 'QueuePort.sendMessage',
      });

      // 성공 알림 전송
      await this.notificationService.sendMicroscopeIngestRequested(userId, docId);

      workspace.documents.push(newDocument);
      logger.info(
        { userId, groupId, nodeId, nodeType, taskId: docId },
        'Enqueued Microscope Ingest From Node Task via SQS'
      );

      return workspace;
    } catch (err) {
      logger.error(
        { err, userId, groupId, nodeId },
        'Failed to process node for Microscope workspace, createWorkspaceAndMicroscopeIngestFromNode'
      );

      // 실패 알림 전송
      await this.notificationService.sendMicroscopeIngestRequestFailed(
        userId,
        docId || 'unknown',
        String(err)
      );

      throw new UpstreamError(`Failed to process node ${nodeId}`, { cause: String(err) });
    }
  }

  /**
   * 워크스페이스 내 특정 문서의 진행 상태를 갱신합니다. (Worker -> API 통신 시 사용)
   *
   * @param userId 유저 ID (소유권 확인용 - SQS 페이로드 기준)
   * @param groupId 워크스페이스 ID
   * @param docId 상태를 변경할 대상 문서의 고유 ID
   * @param status 변경될 최종 상태 (COMPLETED, FAILED 등)
   * @param sourceId (옵션) 파싱 성공 시 발행된 Neo4j Source Node ID
   * @param downloadedGraphData (옵션) 파싱 성공 시 반환받은 그래프 데이터
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
    downloadedGraphData?: AiMicroscopeIngestResultItem[],
    error?: string
  ): Promise<MicroscopeWorkspaceMetaDoc> {
    // 1. 워크스페이스 존재 여부 확인
    const workspace = await this.microscopeWorkspaceStore.findById(groupId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${groupId} not found`);
    }
    // 2. 소유권 확인
    if (workspace.userId !== userId) {
      throw new ForbiddenError('You do not have permission to modify this workspace');
    }

    try {
      let graphPayloadId: string | undefined = undefined;

      // 3. 그래프 데이터 저장
      if (downloadedGraphData && status === 'COMPLETED') {
        graphPayloadId = `ply_microscope_${ulid()}`;

        let allNodes: MicroscopeGraphNodeDoc[] = [];
        let allEdges: MicroscopeGraphEdgeDoc[] = [];

        if (Array.isArray(downloadedGraphData)) {
          downloadedGraphData.forEach((item) => {
            if (item.nodes) {
              allNodes.push(
                ...item.nodes.map(
                  (node) =>
                    ({
                      id: `node_${ulid()}`,
                      ...node,
                    }) as MicroscopeGraphNodeDoc
                )
              );
            }
            if (item.edges) {
              allEdges.push(
                ...item.edges.map(
                  (edge) =>
                    ({
                      id: `edge_${ulid()}`,
                      ...edge,
                    }) as MicroscopeGraphEdgeDoc
                )
              );
            }
          });
        }

        const graphData = {
          nodes: allNodes,
          edges: allEdges,
        };

        await this.microscopeWorkspaceStore.saveGraphPayload({
          _id: graphPayloadId,
          groupId,
          taskId: docId,
          userId,
          graphData,
          // createdAt은 repository layer가 항상 설정합니다.
          createdAt: '',
        });
        logger.info(
          { userId, groupId, docId, graphPayloadId },
          'Saved Microscope graph payload to MongoDB'
        );
      }

      // 4. 문서 상태 업데이트
      await this.microscopeWorkspaceStore.updateDocumentStatus(
        groupId,
        docId,
        status,
        sourceId,
        graphPayloadId,
        error
      );
      logger.info(
        { userId, groupId, docId, status },
        `Microscope document status updated to ${status}`
      );

      // 5. 업데이트 후 최신 상태 반환 (Handler에서 전체 문서 중 마지막인지 여부 파악 용도)
      const updatedWorkspace = await this.microscopeWorkspaceStore.findById(groupId);
      return updatedWorkspace as MicroscopeWorkspaceMetaDoc;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
      if (err instanceof NotFoundError) throw err;
      logger.error(
        { err, userId, groupId, docId },
        'Failed to update document status, updateDocumentStatus'
      );
      throw new UpstreamError('Failed to update document status', { cause: String(err) });
    }
  }

  /**
   * 특정 노드 ID로 가장 최근에 요청된 Ingest의 워크스페이스 메타데이터를 반환합니다.
   * FE에서 워크스페이스 ID 없이도 ingest 진행 상태(PROCESSING, COMPLETED 등)를 추적하기 위해 사용됩니다.
   *
   * @description
   * 정렬 기준: `documents.createdAt DESC` — 동일 nodeId로 여러 번 Ingest를 요청한 경우,
   * workspace.updatedAt 기준이 아닌 document.createdAt 기준을 사용하므로
   * "완료된 오래된 Ingest"가 "진행 중인 최신 Ingest"보다 우선 반환되는 역전 현상을 방지합니다.
   *
   * @param userId 유저 ID
   * @param nodeId 대상 노드 ID (Note 또는 Conversation의 _id)
   * @returns 가장 최근에 요청된 Ingest를 포함하는 MicroscopeWorkspaceMetaDoc.
   *   반환된 documents 배열에서 `documents.find(d => d.nodeId === nodeId)`로 특정 Document의 status를 확인하십시오.
   * @throws {NotFoundError} NOT_FOUND — 해당 nodeId로 생성된 워크스페이스가 존재하지 않을 때
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 시
   * @example
   * const workspace = await service.getLatestWorkspaceByNodeId('user_1', 'note_abc');
   * const doc = workspace.documents.find(d => d.nodeId === 'note_abc');
   * console.log(doc?.status); // 'PROCESSING' | 'COMPLETED' | 'FAILED'
   */
  async getLatestWorkspaceByNodeId(
    userId: string,
    nodeId: string
  ): Promise<MicroscopeWorkspaceMetaDoc> {
    const workspace =
      await this.microscopeWorkspaceStore.findWorkspaceByMostRecentDocumentNodeId(userId, nodeId);

    if (!workspace) {
      throw new NotFoundError(`No microscope workspace found for node ${nodeId}`);
    }

    logger.info({ userId, nodeId, workspaceId: workspace._id }, 'Found latest workspace by nodeId');
    return workspace;
  }

  /**
   * 워크스페이스 내 모든 문서의 그래프 데이터를 취합하여 반환합니다.
   * @param userId 유저 ID (소유권 확인용)
   * @param workspaceId 워크스페이스 ID
   * @returns 취합된 그래프 데이터
   * @throws {NotFoundError} 워크스페이스가 없거나 docId가 존재하지 않을 때
   * @throws {ForbiddenError} 권한 부족 시
   */
  async getWorkspaceGraph(userId: string, workspaceId: string): Promise<MicroscopeGraphDataDto[]> {
    const workspace: MicroscopeWorkspaceMetaDoc | null =
      await this.microscopeWorkspaceStore.findById(workspaceId);

    // 1. 워크스페이스 존재 여부 확인
    if (!workspace) {
      throw new NotFoundError(`Workspace ${workspaceId} not found`);
    }
    // 2. 소유권 확인
    if (workspace.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access graph of this workspace');
    }

    return this.aggregateGraphFromWorkspace(userId, workspace);
  }

  /**
   * 특정 노드 ID에 대응되는 가장 최신의 Microscope 지식 그래프 데이터를 조회합니다.
   * FE에서 단일 노드(노트/대화)와 매핑된 그래프를 즉시 가져오기 위해 사용됩니다.
   *
   * @param userId 유저 ID
   * @param nodeId 대상 노드 ID
   * @returns 최신 그래프 데이터 (MicroscopeGraphDataDto 단일 객체)
   */
  async getLatestGraphByNodeId(userId: string, nodeId: string): Promise<MicroscopeGraphDataDto> {
    // 1. 해당 유저의 특정 노드 ID가 포함된 가장 최근 워크스페이스 조회
    const workspace = await this.microscopeWorkspaceStore.findLatestWorkspaceByNodeId(
      userId,
      nodeId
    );

    if (!workspace) {
      logger.info({ userId, nodeId }, 'No microscope workspace found for node');
      return { nodes: [], edges: [] };
    }

    // 2. 해당 워크스페이스 내의 모든 COMPLETED 그래프 데이터 취합
    const graphDataList = await this.aggregateGraphFromWorkspace(userId, workspace);

    // 리스트 중 첫 번째(통합된) 객체 반환
    return graphDataList[0] || { nodes: [], edges: [] };
  }

  /**
   * 워크스페이스 메타데이터를 기반으로 내부의 모든 그래프 페이로드를 읽어와 하나의 DTO로 병합합니다.
   * @private
   */
  private async aggregateGraphFromWorkspace(
    userId: string,
    workspace: MicroscopeWorkspaceMetaDoc
  ): Promise<MicroscopeGraphDataDto[]> {
    const workspaceId = workspace._id;
    try {
      // 1. COMPLETED 상태이고 graphPayloadId가 있는 문서들 확인
      const payloadIds: string[] = workspace.documents
        .filter((doc) => doc.status === 'COMPLETED' && doc.graphPayloadId)
        .map((doc) => doc.graphPayloadId as string);

      if (payloadIds.length === 0) {
        return [{ nodes: [], edges: [] }];
      }

      // 2. Mongo DB Payload 컬렉션에서 데이터 로드
      const microscopeGraphs: MicroscopeGraphPayloadDoc[] =
        await this.microscopeWorkspaceStore.findGraphPayloadsByIds(payloadIds);

      // 3. 하나의 통일된 Graph Data(MicroscopeGraphDataDto)로 병합
      const mergedNodes: MicroscopeGraphNodeDoc[] = [];
      const mergedEdges: MicroscopeGraphEdgeDoc[] = [];

      for (const payload of microscopeGraphs) {
        if (!payload.graphData) continue;

        const items = Array.isArray(payload.graphData) ? payload.graphData : [payload.graphData];

        for (const item of items) {
          if (item.nodes && Array.isArray(item.nodes)) {
            for (const node of item.nodes) {
              mergedNodes.push(node as MicroscopeGraphNodeDoc);
            }
          }

          if (item.edges && Array.isArray(item.edges)) {
            for (const edge of item.edges) {
              mergedEdges.push(edge as MicroscopeGraphEdgeDoc);
            }
          }
        }
      }

      logger.info(
        { userId, workspaceId, totalFiles: payloadIds.length },
        'Successfully aggregated workspace graph data from Mongo'
      );

      return [
        {
          nodes: mergedNodes,
          edges: mergedEdges,
        },
      ];
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
      logger.error(
        { err, userId, workspaceId },
        'Failed to fetch and aggregate workspace graph data from Mongo'
      );
      throw new UpstreamError('Failed to fetch workspace graph data from Mongo', {
        cause: String(err),
      });
    }
  }
}
