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
  MicroscopeDocumentVisualizationMeta,
  MicroscopeBlockGraphPayloadDoc,
  MicroscopeBlockRawTextPayloadDoc,
  MicroscopeBlockItemDoc,
  MicroscopeBlockEdgeDoc,
} from '../types/persistence/microscope_workspace.persistence';
import { MicroscopeWorkspaceStore } from '../ports/MicroscopeWorkspaceStore';
import { GraphNeo4jStore } from '../ports/GraphNeo4jStore';
import { QueuePort } from '../ports/QueuePort';
import { StoragePort } from '../ports/StoragePort';
import { MicroscopeGraphDataDto, MicroscopeBlockGraphDto, MicroscopeBlockItemDto } from '../../shared/dtos/microscope';
import { TaskType, type MicroscopeIngestRawFileQueuePayload } from '../../shared/dtos/queue';
import { sanitizeMacroBundleFileSegment } from '../../shared/utils/macroBundleFiles';
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
import { UserService } from './UserService';
import { AiMicroscopeIngestResultItem } from '../../shared/dtos/ai_graph_output';
import { withRetry } from '../../shared/utils/retry';
import { parseUserIdFromMicroscopeNodeTaskId } from '../../shared/utils/microscopeTaskId';
import { ICreditService } from '../ports/ICreditService';
import { CreditFeature } from '../types/persistence/credit.persistence';

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
   * @param notificationService 알림 전송 서비스.
   * @param userService 사용자 프로필(선호 언어 포함) 조회 서비스.
   */
  constructor(
    private readonly microscopeWorkspaceStore: MicroscopeWorkspaceStore,
    private readonly graphNeo4jStore: GraphNeo4jStore,
    private readonly queuePort: QueuePort,
    private readonly storagePort: StoragePort,
    private readonly conversationRepo: ConversationRepository,
    private readonly noteRepo: NoteRepository,
    private readonly notificationService: NotificationService,
    private readonly userService: UserService,
    private readonly creditService?: ICreditService
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
   * @description 기존 워크스페이스에 raw file을 업로드하고 Microscope ingest(raw_file) 파이프라인을 큐에 등록합니다.
   * @param userId 요청 사용자 ID입니다.
   * @param groupId 대상 워크스페이스 ID입니다.
   * @param files multer가 수신한 파일 버퍼 목록입니다.
   * @param schemaName 온톨로지 스키마 이름(선택)입니다.
   * @returns 문서 메타가 추가된 워크스페이스입니다.
   * @throws {ValidationError} 파일이 없을 때
   * @throws {NotFoundError} 워크스페이스가 없을 때
   * @throws {ForbiddenError} 소유권이 없을 때
   */
  async ingestRawDocumentsToWorkspace(
    userId: string,
    groupId: string,
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
    schemaName?: string,
    blockMode?: boolean
  ): Promise<MicroscopeWorkspaceMetaDoc> {
    if (!files.length) {
      throw new ValidationError('At least one file is required');
    }

    const workspace = await this.getWorkspaceActivity(userId, groupId);
    const bucket = process.env.S3_PAYLOAD_BUCKET || 'graph-node-payloads';
    const now = new Date().toISOString();

    for (const file of files) {
      const docId = `task_microscope_file_${userId}_${ulid()}`;
      const safeName = sanitizeMacroBundleFileSegment(file.originalname);
      const s3Key = `microscope-ingest/${userId}/${docId}/${safeName}`;

      let creditHeld = false;
      let messageSent = false;

      try {
        await this.holdCredit(userId, CreditFeature.MICROSCOPE_INGEST, docId);
        creditHeld = true;

        await withRetry(
          async () =>
            await this.storagePort.upload(s3Key, file.buffer, file.mimetype || 'application/octet-stream', {
              bucketType: 'payload',
            }),
          { label: 'Storage.upload.microscopeRawFile' }
        );

        const newDocument: MicroscopeDocumentMetaDoc = {
          id: docId,
          s3Key,
          fileName: file.originalname,
          status: 'PROCESSING',
          nodeType: 'file',
          ingestMode: 'raw_file',
          blockModeRequested: true,
          blockStatus: 'PROCESSING',
          nonBlockStatus: 'PROCESSING',
          createdAt: now,
          updatedAt: now,
        };

        await this.microscopeWorkspaceStore.addDocument(groupId, newDocument);

        const basePayload = {
          user_id: userId,
          group_id: groupId,
          s3_key: s3Key,
          bucket,
          file_name: file.originalname,
          schema_name: schemaName,
          ingest_mode: 'raw_file' as const,
        };

        // block 요청
        await withRetry(
          async () =>
            await this.queuePort.sendMessage(this.jobQueueUrl, {
              taskId: `${docId}_block`,
              taskType: TaskType.MICROSCOPE_INGEST_REQUEST,
              payload: { ...basePayload, block_mode: true, generate_micro_graphs: true },
              timestamp: now,
            } as MicroscopeIngestRawFileQueuePayload),
          { label: 'QueuePort.sendMessage.microscopeRawFile.block' }
        );

        // non-block 요청
        await withRetry(
          async () =>
            await this.queuePort.sendMessage(this.jobQueueUrl, {
              taskId: `${docId}_nonblock`,
              taskType: TaskType.MICROSCOPE_INGEST_REQUEST,
              payload: { ...basePayload, block_mode: false },
              timestamp: now,
            } as MicroscopeIngestRawFileQueuePayload),
          { label: 'QueuePort.sendMessage.microscopeRawFile.nonblock' }
        );
        messageSent = true;

        workspace.documents.push(newDocument);
        await this.notificationService.sendMicroscopeIngestRequested(userId, docId);
      } catch (err) {
        if (creditHeld && !messageSent) {
          await this.rollbackCreditHold(docId, 'microscope raw file enqueue failed');
        }
        logger.error({ err, userId, groupId, fileName: file.originalname }, 'Failed to ingest raw file');
        if (err instanceof AppError) throw err;
        throw new UpstreamError('Failed to enqueue microscope raw file ingest', { cause: String(err) });
      }
    }

    logger.info(
      { userId, groupId, fileCount: files.length },
      'Enqueued Microscope raw file ingest tasks via SQS'
    );

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
    schemaName?: string,
    blockMode?: boolean
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

    // 2. 사용자 선호 언어 조회 (AI 워커에 언어 힌트 전달용)
    let preferredLanguage = 'ko'; // 기본값
    try {
      const userProfile = await this.userService.getUserProfile(userId);
      preferredLanguage = userProfile.preferredLanguage ?? 'ko';
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to fetch user preferredLanguage, defaulting to "ko"');
    }

    // 3. 워크스페이스 신규 생성
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
      ingestMode: 'from_graphnode',
      blockModeRequested: true,
      blockStatus: 'PROCESSING',
      nonBlockStatus: 'PROCESSING',
      createdAt: now,
      updatedAt: now,
    };

    let creditHeld = false;
    let messageSent = false;

    try {
      // 3-1. 선제적 크레딧 차감 (Hold)
      await this.holdCredit(userId, CreditFeature.MICROSCOPE_INGEST, docId);
      creditHeld = true;

      // 4. MongoDB 상태 트리거 등록
      await this.microscopeWorkspaceStore.addDocument(groupId, newDocument);

      const basePayload = {
        user_id: userId,
        node_id: nodeId,
        node_type: nodeType,
        group_id: groupId,
        schema_name: schemaName,
        language: preferredLanguage,
        ingest_mode: 'from_graphnode' as const,
      };
      const timestamp = new Date().toISOString();

      // 5a. SQS block 요청 (block_mode=true, generateMicroGraphs=true)
      await withRetry(
        async () =>
          await this.queuePort.sendMessage(this.jobQueueUrl, {
            taskId: `${docId}_block`,
            taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_REQUEST,
            payload: { ...basePayload, block_mode: true, generate_micro_graphs: true },
            timestamp,
          }),
        { label: 'QueuePort.sendMessage.block' }
      );

      // 5b. SQS non-block 요청 (block_mode=false)
      await withRetry(
        async () =>
          await this.queuePort.sendMessage(this.jobQueueUrl, {
            taskId: `${docId}_nonblock`,
            taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_REQUEST,
            payload: { ...basePayload, block_mode: false },
            timestamp,
          }),
        { label: 'QueuePort.sendMessage.nonblock' }
      );
      messageSent = true;

      // 성공 알림 전송
      await this.notificationService.sendMicroscopeIngestRequested(userId, docId);

      workspace.documents.push(newDocument);
      logger.info(
        { userId, groupId, nodeId, nodeType, taskId: docId },
        'Enqueued Microscope Ingest From Node Task via SQS'
      );

      return workspace;
    } catch (err) {
      // 3-2. 선제적 차감된 크레딧 롤백 (Rollback)
      if (creditHeld && !messageSent) {
        await this.rollbackCreditHold(docId, 'microscope ingest enqueue failed');
      }

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

      if (err instanceof AppError) throw err;
      throw new UpstreamError(`Failed to process node ${nodeId}`, { cause: String(err) });
    }
  }

  /**
   * 다중 소스(Multi-source)를 하나의 워크스페이스에 묶어 Microscope Ingest 파이프라인을 시작합니다.
   * 각 source마다 동일 group_id로 SQS 메시지를 발행하며, 개별 SQS 전송 실패 시
   * 해당 document만 FAILED로 기록하고 나머지는 계속 진행합니다(부분 성공 허용).
   * 크레딧은 워크스페이스 단위로 flat 1회 Hold합니다.
   *
   * @param userId 유저 고유 ID
   * @param sources Ingest할 소스 배열. 각 항목은 nodeId와 nodeType을 포함합니다.
   * @param schemaName (선택) 엔티티 추출 스키마 명칭
   * @returns 생성된 워크스페이스의 메타데이터 전체
   * @throws {ValidationError} sources 배열이 비어있을 때
   * @throws {UpstreamError} 워크스페이스 생성 또는 크레딧 Hold 실패 시
   * @example
   * const ws = await service.createMultiSourceWorkspace('user_1', [
   *   { nodeId: 'note_abc', nodeType: 'note' },
   *   { nodeId: 'conv_xyz', nodeType: 'conversation' },
   * ]);
   */
  async createMultiSourceWorkspace(
    userId: string,
    sources: Array<{ nodeId: string; nodeType: 'note' | 'conversation' }>,
    schemaName?: string
  ): Promise<MicroscopeWorkspaceMetaDoc> {
    if (!sources || sources.length === 0) {
      throw new ValidationError('sources must contain at least one item');
    }

    // 1. 워크스페이스 이름 — 첫 번째 소스 제목 기반, 실패 시 기본값
    let workspaceName = `Multi-source Workspace (${sources.length})`;
    const firstSource = sources[0];
    try {
      if (firstSource.nodeType === 'note') {
        const note = await this.noteRepo.getNote(firstSource.nodeId, userId);
        if (note) workspaceName = note.title || workspaceName;
      } else if (firstSource.nodeType === 'conversation') {
        const conv = await this.conversationRepo.findById(firstSource.nodeId, userId);
        if (conv) workspaceName = conv.title || workspaceName;
      }
    } catch (err) {
      logger.warn(
        { err, userId, nodeId: firstSource.nodeId },
        'Failed to fetch first source title, using default workspace name'
      );
    }

    // 2. 사용자 선호 언어
    let preferredLanguage = 'ko';
    try {
      const userProfile = await this.userService.getUserProfile(userId);
      preferredLanguage = userProfile.preferredLanguage ?? 'ko';
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to fetch user preferredLanguage, defaulting to "ko"');
    }

    // 3. 워크스페이스 생성 (하나의 groupId = AI layer group_id)
    const workspace = await this.createWorkspace(userId, workspaceName);
    const groupId = workspace._id;

    // 4. 크레딧 Hold — 워크스페이스 단위 flat 1회 (BM 변경 시 ICreditService 구현체만 교체)
    const workspaceCreditTaskId = `task_microscope_ws_${userId}_${ulid()}`;
    let creditHeld = false;
    let anyMessageSent = false;

    try {
      await this.holdCredit(userId, CreditFeature.MICROSCOPE_INGEST, workspaceCreditTaskId);
      creditHeld = true;
    } catch (err) {
      logger.error({ err, userId, groupId }, 'Failed to hold credit for multi-source workspace');
      throw err instanceof AppError
        ? err
        : new UpstreamError('Failed to hold credit', { cause: String(err) });
    }

    // 5. 각 소스별 문서 등록 및 SQS 발행 (부분 실패 허용)
    // FIXME(2026_05_17) : 이거 AI 서버로 어떻게 보낼 지 정의해야 함, 이렇게 여러 개의 Message로 나뉘어 보내선 안됨.
    const now = new Date().toISOString();

    for (const source of sources) {
      const docId = `task_microscope_node_${userId}_${ulid()}`;
      const doc: MicroscopeDocumentMetaDoc = {
        id: docId,
        s3Key: '',
        fileName: `${source.nodeId}.md`,
        status: 'PROCESSING',
        nodeId: source.nodeId,
        nodeType: source.nodeType,
        blockModeRequested: true,
        blockStatus: 'PROCESSING',
        nonBlockStatus: 'PROCESSING',
        createdAt: now,
        updatedAt: now,
      };

      try {
        await this.microscopeWorkspaceStore.addDocument(groupId, doc);
      } catch (err) {
        logger.error(
          { err, userId, groupId, docId, nodeId: source.nodeId },
          'Failed to register document, skipping source'
        );
        continue;
      }

      try {
        const basePayload = {
          user_id: userId,
          node_id: source.nodeId,
          node_type: source.nodeType,
          group_id: groupId,
          schema_name: schemaName,
          language: preferredLanguage,
          ingest_mode: 'from_graphnode' as const,
        };
        const timestamp = new Date().toISOString();

        await withRetry(
          async () =>
            await this.queuePort.sendMessage(this.jobQueueUrl, {
              taskId: `${docId}_block`,
              taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_REQUEST,
              payload: { ...basePayload, block_mode: true, generate_micro_graphs: true },
              timestamp,
            }),
          { label: `QueuePort.sendMessage:multi:block:${docId}` }
        );

        await withRetry(
          async () =>
            await this.queuePort.sendMessage(this.jobQueueUrl, {
              taskId: `${docId}_nonblock`,
              taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_REQUEST,
              payload: { ...basePayload, block_mode: false },
              timestamp,
            }),
          { label: `QueuePort.sendMessage:multi:nonblock:${docId}` }
        );

        anyMessageSent = true;
        logger.info(
          { userId, groupId, docId, nodeId: source.nodeId },
          'Enqueued dual SQS for multi-source Microscope Ingest'
        );
      } catch (err) {
        logger.error(
          { err, userId, groupId, docId, nodeId: source.nodeId },
          'SQS send failed for source, marking FAILED'
        );
        try {
          await this.microscopeWorkspaceStore.updateDocumentStatus(
            groupId,
            docId,
            'FAILED',
            undefined,
            undefined,
            String(err)
          );
        } catch (updateErr) {
          logger.error(
            { updateErr, groupId, docId },
            'Failed to mark document as FAILED after SQS error'
          );
        }
      }
    }

    // 6. 모든 SQS 전송 실패 시 크레딧 롤백
    if (creditHeld && !anyMessageSent) {
      await this.rollbackCreditHold(
        workspaceCreditTaskId,
        'all multi-source ingest SQS sends failed'
      );
    }

    await this.notificationService.sendMicroscopeIngestRequested(userId, workspaceCreditTaskId);

    const updatedWorkspace = await this.microscopeWorkspaceStore.findById(groupId);
    logger.info(
      { userId, groupId, sourceCount: sources.length, anyMessageSent },
      'Multi-source Microscope workspace created'
    );
    return updatedWorkspace ?? workspace;
  }

  /**
   * 크레딧 차감 (Hold)
   * @param userId 사용자 ID
   * @param feature 기능
   * @param taskId 작업 ID
   * @returns
   */
  private async holdCredit(userId: string, feature: CreditFeature, taskId: string): Promise<void> {
    if (!this.creditService) return;
    await this.creditService.hold(userId, feature, taskId);
  }

  /**
   * 크레딧 차감 롤백 (Rollback)
   * @param taskId 작업 ID
   * @param reason 사유
   * @returns
   */
  private async rollbackCreditHold(taskId: string, reason: string): Promise<void> {
    if (!this.creditService) return;

    try {
      await this.creditService.rollbackByTaskId(taskId);
    } catch (err) {
      logger.error({ err, taskId, reason }, 'Failed to rollback credit hold after queue failure');
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
  /**
   * @description Microscope ingest 결과 payload에서 워크스페이스 ID(group_id)를 해석합니다.
   * @param userId 요청 사용자 ID입니다.
   * @param docId SQS taskId와 동일한 문서 작업 ID입니다.
   * @param groupIdFromPayload AI가 반환한 group_id(또는 workspace_id)입니다. 없으면 Mongo 조회합니다.
   * @returns Mongo 워크스페이스 `_id`입니다.
   * @throws {NotFoundError} NOT_FOUND — payload·DB 모두에서 워크스페이스를 찾지 못한 경우
   */
  async resolveGroupIdForIngestResult(
    userId: string | undefined,
    docId: string,
    groupIdFromPayload?: string
  ): Promise<string> {
    if (groupIdFromPayload?.trim()) {
      return groupIdFromPayload.trim();
    }

    const resolvedUserId = userId?.trim() || parseUserIdFromMicroscopeNodeTaskId(docId);
    const workspace = await this.microscopeWorkspaceStore.findWorkspaceByDocumentId(
      resolvedUserId || undefined,
      docId
    );
    if (!workspace) {
      throw new NotFoundError(`Workspace for document ${docId} not found`);
    }

    return workspace._id;
  }

  async updateDocumentStatus(
    userId: string,
    groupId: string,
    docId: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    sourceId?: string,
    downloadedGraphData?: AiMicroscopeIngestResultItem[],
    error?: string,
    visualization?: MicroscopeDocumentVisualizationMeta,
    isDualMode = false
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

      // 3. non-block 그래프 데이터 저장
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

        await this.microscopeWorkspaceStore.saveGraphPayload({
          _id: graphPayloadId,
          groupId,
          taskId: docId,
          userId,
          graphData: { nodes: allNodes, edges: allEdges },
          createdAt: '',
        });
        logger.info({ userId, groupId, docId, graphPayloadId }, 'Saved Microscope graph payload to MongoDB');
      }

      // 4. 듀얼 SQS 모드: nonBlockStatus 갱신 후 전체 상태 계산
      if (isDualMode) {
        const freshWorkspace = await this.microscopeWorkspaceStore.findById(groupId);
        const doc = freshWorkspace?.documents.find((d) => d.id === docId);
        const currentBlockStatus = doc?.blockStatus ?? 'PROCESSING';
        const overallStatus = this.computeOverallStatus(currentBlockStatus, status);

        await this.microscopeWorkspaceStore.updateDocumentSubStatus(groupId, docId, {
          nonBlockStatus: status,
          status: overallStatus,
          error: error,
        });

        // 기존 필드도 함께 업데이트 (sourceId, graphPayloadId, visualization)
        await this.microscopeWorkspaceStore.updateDocumentStatus(
          groupId,
          docId,
          overallStatus,
          sourceId,
          graphPayloadId,
          error,
          visualization
        );
      } else {
        // 레거시(단일 SQS) 모드: 전체 status 직접 업데이트
        await this.microscopeWorkspaceStore.updateDocumentStatus(
          groupId,
          docId,
          status,
          sourceId,
          graphPayloadId,
          error,
          visualization
        );
      }

      logger.info({ userId, groupId, docId, status, isDualMode }, `Microscope nonBlock status updated`);

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
      logger.error({ err, userId, groupId, docId }, 'Failed to update document status');
      throw new UpstreamError('Failed to update document status', { cause: String(err) });
    }
  }

  /**
   * @description Block 뷰 결과 처리: blockStatus 갱신 및 block_graph.json 데이터 저장.
   * @param userId 요청 사용자 ID
   * @param groupId 워크스페이스 ID
   * @param docId base 문서 ID (_block 접미사 제거 후)
   * @param status AI 처리 결과 상태
   * @param blockGraphJson block_graph.json 파싱 결과 (optional)
   * @param error 실패 시 에러 메시지 (optional)
   * @param visualization S3 키 스냅샷 (optional)
   * @returns 갱신된 워크스페이스 메타데이터
   * @throws {NotFoundError} 워크스페이스 또는 문서가 없을 때
   * @throws {ForbiddenError} 소유권 불일치 시
   * @throws {UpstreamError} DB 저장 실패 시
   */
  async updateBlockViewDocumentStatus(
    userId: string,
    groupId: string,
    docId: string,
    status: MicroscopeDocumentStatus,
    blockGraphJson?: Record<string, unknown>,
    error?: string,
    visualization?: MicroscopeDocumentVisualizationMeta
  ): Promise<MicroscopeWorkspaceMetaDoc> {
    const workspace = await this.microscopeWorkspaceStore.findById(groupId);
    if (!workspace) throw new NotFoundError(`Workspace ${groupId} not found`);
    if (workspace.userId !== userId)
      throw new ForbiddenError('You do not have permission to modify this workspace');

    try {
      let blockGraphPayloadId: string | undefined;

      if (status === 'COMPLETED' && blockGraphJson) {
        blockGraphPayloadId = await this.saveBlockGraphData(userId, groupId, docId, blockGraphJson);
      }

      // blockStatus 갱신 후 전체 상태 계산
      const freshWorkspace = await this.microscopeWorkspaceStore.findById(groupId);
      const doc = freshWorkspace?.documents.find((d) => d.id === docId);
      const currentNonBlockStatus = doc?.nonBlockStatus ?? 'PROCESSING';
      const overallStatus = this.computeOverallStatus(status, currentNonBlockStatus);

      await this.microscopeWorkspaceStore.updateDocumentSubStatus(groupId, docId, {
        blockStatus: status,
        status: overallStatus,
        blockGraphPayloadId,
        blockGraphS3Key: visualization?.blockGraphS3Key,
        error: error,
      });

      logger.info(
        { userId, groupId, docId, blockStatus: status, overallStatus, blockGraphPayloadId },
        'Block view document status updated'
      );

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
      logger.error({ err, userId, groupId, docId }, 'Failed to update block view document status');
      throw new UpstreamError('Failed to update block view document status', { cause: String(err) });
    }
  }

  /**
   * @description block_graph.json 원시 데이터를 파싱하여 두 컬렉션(블록 그래프 + rawText)에 저장합니다.
   * rawTexts 총 크기가 10MB를 초과하면 MongoDB 저장을 건너뜁니다 (S3 lazy load로 대체).
   * @returns 저장된 block graph payload ID
   */
  private async saveBlockGraphData(
    userId: string,
    groupId: string,
    docId: string,
    blockGraphJson: Record<string, unknown>
  ): Promise<string> {
    const rawBlockGraph = (blockGraphJson as any)?.block_graph ?? blockGraphJson;
    const rawBlocks: any[] = rawBlockGraph?.blocks ?? [];
    const blockEdges: MicroscopeBlockEdgeDoc[] = rawBlockGraph?.edges ?? [];
    const paths: string[][] = rawBlockGraph?.paths ?? [];
    const orderingRationale: string | undefined = rawBlockGraph?.ordering_rationale;

    const blocks: MicroscopeBlockItemDoc[] = rawBlocks.map((b: any) => ({
      block_id: b.block_id ?? b.id ?? `blk_${ulid()}`,
      title: b.title ?? '',
      summary: b.summary,
      key_concepts: b.key_concepts ?? [],
      order_index: b.order_index ?? 0,
      turn_range: b.turn_range ?? null,
      micro_graph: {
        nodes: (b.micro_graph?.nodes ?? []).map((n: any) => ({
          id: n.id ?? `node_${ulid()}`,
          name: n.name ?? '',
          type: n.type ?? '',
          description: n.description ?? '',
          source_chunk_id: n.source_chunk_id ?? null,
        })) as MicroscopeGraphNodeDoc[],
        edges: (b.micro_graph?.edges ?? []).map((e: any) => ({
          id: e.id ?? `edge_${ulid()}`,
          start: e.start ?? e.source ?? '',
          target: e.target ?? '',
          type: e.type ?? '',
          description: e.description ?? '',
          source_chunk_id: e.source_chunk_id ?? null,
          evidence: e.evidence ?? '',
          confidence: e.confidence ?? 0,
        })) as MicroscopeGraphEdgeDoc[],
      },
    }));

    const blockGraphPayloadId = `ply_block_${ulid()}`;
    await this.microscopeWorkspaceStore.saveBlockGraphPayload({
      _id: blockGraphPayloadId,
      groupId,
      taskId: docId,
      userId,
      blockGraph: { blocks, edges: blockEdges, paths, ordering_rationale: orderingRationale },
      createdAt: '',
    });

    // rawText 저장 (10MB 임계치 초과 시 스킵)
    const rawTexts = rawBlocks
      .filter((b: any) => typeof b.raw_text === 'string' && b.raw_text.length > 0)
      .map((b: any) => ({
        blockId: b.block_id ?? b.id ?? '',
        rawText: b.raw_text as string,
      }));

    const estimatedByteSize = rawTexts.reduce((acc, r) => acc + Buffer.byteLength(r.rawText, 'utf8'), 0);
    const TEN_MB = 10 * 1024 * 1024;

    if (rawTexts.length > 0 && estimatedByteSize <= TEN_MB) {
      await this.microscopeWorkspaceStore.saveBlockRawTextPayload({
        _id: `ply_rawtext_${ulid()}`,
        groupId,
        taskId: docId,
        userId,
        rawTexts,
        createdAt: '',
      });
      logger.info({ groupId, docId, rawTextCount: rawTexts.length }, 'Saved block rawTexts to MongoDB');
    } else if (estimatedByteSize > TEN_MB) {
      logger.warn(
        { groupId, docId, estimatedByteSize },
        'Block rawTexts exceed 10MB threshold — skipping MongoDB storage, FE should use blockGraphS3Key'
      );
    }

    return blockGraphPayloadId;
  }

  /**
   * @description 두 파이프라인(block/nonBlock) 상태를 기반으로 전체 문서 상태를 계산합니다.
   * 둘 다 COMPLETED → COMPLETED, 어느 하나라도 FAILED → FAILED, 그 외 → PROCESSING
   */
  private computeOverallStatus(
    blockStatus: MicroscopeDocumentStatus,
    nonBlockStatus: MicroscopeDocumentStatus
  ): MicroscopeDocumentStatus {
    if (blockStatus === 'COMPLETED' && nonBlockStatus === 'COMPLETED') return 'COMPLETED';
    if (blockStatus === 'FAILED' || nonBlockStatus === 'FAILED') return 'FAILED';
    return 'PROCESSING';
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
    const workspace = await this.microscopeWorkspaceStore.findWorkspaceByMostRecentDocumentNodeId(
      userId,
      nodeId
    );

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
   * Block 뷰 데이터가 있으면 `blockView` 필드에 포함합니다.
   * @private
   */
  private async aggregateGraphFromWorkspace(
    userId: string,
    workspace: MicroscopeWorkspaceMetaDoc
  ): Promise<MicroscopeGraphDataDto[]> {
    const workspaceId = workspace._id;
    try {
      const completedDocs = workspace.documents.filter((doc) => doc.status === 'COMPLETED');

      // 1. non-block 그래프 페이로드 로드
      const payloadIds: string[] = completedDocs
        .filter((doc) => doc.graphPayloadId)
        .map((doc) => doc.graphPayloadId as string);

      const mergedNodes: MicroscopeGraphNodeDoc[] = [];
      const mergedEdges: MicroscopeGraphEdgeDoc[] = [];

      if (payloadIds.length > 0) {
        const microscopeGraphs = await this.microscopeWorkspaceStore.findGraphPayloadsByIds(payloadIds);

        for (const payload of microscopeGraphs) {
          if (!payload.graphData) continue;
          const items = Array.isArray(payload.graphData) ? payload.graphData : [payload.graphData];
          for (const item of items) {
            if (item.nodes && Array.isArray(item.nodes)) {
              mergedNodes.push(...(item.nodes as MicroscopeGraphNodeDoc[]));
            }
            if (item.edges && Array.isArray(item.edges)) {
              mergedEdges.push(...(item.edges as MicroscopeGraphEdgeDoc[]));
            }
          }
        }
      }

      // 2. Block 뷰 페이로드 로드 (blockGraphPayloadId 또는 taskId로 조회)
      let blockView: MicroscopeBlockGraphDto | undefined;

      const blockDoc = completedDocs.find((doc) => doc.blockGraphPayloadId);
      if (blockDoc) {
        const blockPayload = await this.microscopeWorkspaceStore.findBlockGraphPayloadByTaskId(
          blockDoc.id
        );

        if (blockPayload) {
          // rawTexts merge (선택적)
          const rawTextPayload = await this.microscopeWorkspaceStore.findBlockRawTextPayloadByTaskId(
            blockDoc.id
          );
          const rawTextMap = new Map<string, string>();
          if (rawTextPayload) {
            for (const rt of rawTextPayload.rawTexts) {
              rawTextMap.set(rt.blockId, rt.rawText);
            }
          }

          const blocksWithRawText: MicroscopeBlockItemDto[] = blockPayload.blockGraph.blocks.map(
            (b) => ({
              ...b,
              raw_text: rawTextMap.get(b.block_id),
            })
          );

          blockView = {
            blocks: blocksWithRawText,
            edges: blockPayload.blockGraph.edges,
            paths: blockPayload.blockGraph.paths,
            ordering_rationale: blockPayload.blockGraph.ordering_rationale,
          };
        }
      }

      logger.info(
        { userId, workspaceId, nonBlockPayloads: payloadIds.length, hasBlockView: !!blockView },
        'Successfully aggregated workspace graph data from Mongo'
      );

      return [{ nodes: mergedNodes, edges: mergedEdges, blockView }];
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
      logger.error({ err, userId, workspaceId }, 'Failed to fetch and aggregate workspace graph data from Mongo');
      throw new UpstreamError('Failed to fetch workspace graph data from Mongo', { cause: String(err) });
    }
  }
}
