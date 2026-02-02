import { Readable } from 'stream';
import { ulid } from 'ulid';

import { ChatManagementService } from './ChatManagementService';
import { GraphEmbeddingService } from './GraphEmbeddingService';
import { HttpClient } from '../../infra/http/httpClient';
import { AiInputConversation, AiInputData, AiInputMappingNode } from '../../shared/dtos/ai_input';
import { logger } from '../../shared/utils/logger';
import { GraphSnapshotDto, PersistGraphPayloadDto } from '../../shared/dtos/graph';
import { AppError, ConflictError, UpstreamError, NotFoundError } from '../../shared/errors/domain';
import { ChatMessage } from '../../shared/dtos/ai';
import { AiGraphOutputDto } from '../../shared/dtos/ai_graph_output';
import { mapAiOutputToSnapshot } from '../../shared/mappers/ai_graph_output.mapper';
import { GraphGenRequestPayload, AddConversationRequestPayload, TaskType } from '../../shared/dtos/queue';
// Interfaces
import { QueuePort } from '../ports/QueuePort';
import { StoragePort } from '../ports/StoragePort';
import { loadEnv } from '../../config/env';

// TODO: 이 설정은 설정 파일이나 환경 변수로 이동해야 합니다.
// 데모를 위해 AI 서버 URI를 하드코딩.
// 향후 개선 사항: 서비스 디스커버리 또는 로드 밸런서 사용.
// 또한 확장성과 신뢰성을 높이기 위해 메시지 큐(SQS) 사용을 고려.
const AI_SERVER_URI = process.env.AI_SERVER_URI || 'https://aaejmqgtjczzbxcq.tunnel.elice.io';

function toAiInputConversation(conversation: {
  id: string;
  title: string;
  createdAt?: Date;
  updatedAt?: Date;
  messages: ChatMessage[];
}): AiInputConversation {
  const messages: ChatMessage[] = conversation.messages;
  const mapping: Record<string, AiInputMappingNode> = {};

  let prevMsgId: string | null = null;

  messages.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });

  for (const msg of messages) {
    const id = msg.id;
    mapping[id] = {
      id: id,
      message: {
        id: id,
        author: { role: msg.role },
        content: { content_type: 'text', parts: [msg.content] },
      },
      parent: prevMsgId,
      children: [],
    };

    if (prevMsgId && mapping[prevMsgId]) {
      mapping[prevMsgId].children.push(id);
    }

    prevMsgId = id;
  }

  return {
    id: conversation.id,
    conversation_id: conversation.id,
    title: conversation.title,
    create_time: conversation.createdAt ? new Date(conversation.createdAt).getTime() / 1000 : 0,
    update_time: conversation.updatedAt ? new Date(conversation.updatedAt).getTime() / 1000 : 0,
    mapping: mapping,
  };
}

export class GraphGenerationService {
  private readonly httpClient: HttpClient;
  private readonly activeUserTasks = new Set<string>();
  private readonly jobQueueUrl: string;

  constructor(
    private readonly chatManagementService: ChatManagementService,
    private readonly graphEmbeddingService: GraphEmbeddingService,
    private readonly queuePort: QueuePort,
    private readonly storagePort: StoragePort
  ) {
    const env = loadEnv();
    // 타임아웃 5분(300초)으로 설정
    this.httpClient = new HttpClient('GraphAI', {
      baseURL: AI_SERVER_URI || 'https://aaejmqgtjczzbxcq.tunnel.elice.io',
      timeout: 300000,
    });
    // TODO: 환경변수 SQS_QUEUE_URL 추가 필요
    this.jobQueueUrl = process.env.SQS_REQUEST_QUEUE_URL || 'TO_BE_CONFIGURED';
  }

  /**
   * [New] SQS 기반 그래프 생성 요청
   * 사용자의 대화 데이터를 S3에 업로드하고, 작업 요청 메시지를 SQS에 발행합니다.
   *
   * @param userId 사용자 ID
   * @returns 발행된 작업의 연관 ID (TaskId) - 실제 AI TaskId는 아닐 수 있음
   */
  async requestGraphGenerationViaQueue(userId: string): Promise<string> {
    try {
      // 1. 중복 요청 방지 확인(SQS 방식 + ALB 스케일링 때문에 판별 불가)
      // if (this.activeUserTasks.has(userId)) {
      //   logger.warn({ userId }, 'Graph generation already in progress for user');
      //   throw new ConflictError('Graph generation is already in progress for this user.', { status: 'processing' });
      // }

      // 2.TaskId 생성 (UUID 등 사용 권장, 여기서는 간단히 timestamp 기반)
      const taskId = `task_${userId}_${ulid()}`;
      const s3Key = `graph-generation/${taskId}/input.json`;

      //logger.info({ userId, taskId }, 'Preparing graph generation request (S3 + SQS)');

      // 3. 데이터 수집 및 S3 업로드
      // 기존 스트리밍 방식을 활용하되, 여기서는 S3에 저장해야 함.
      // streamUserData는 Generator이므로 Readable Stream으로 변환하여 업로드
      const dataStream = Readable.from(this.streamUserData(userId));

      // S3 업로드
      //logger.info({ userId, s3Key }, 'Uploading input data to S3');
      await this.storagePort.upload(s3Key, dataStream, 'application/json');

      // 4. SQS 메시지 전송(추후 메세지 type 확정 필요)
      const messageBody: GraphGenRequestPayload = {
        taskId,
        taskType: TaskType.GRAPH_GENERATION_REQUEST, // 워커가 구분할 작업 타입
        payload: {
          userId,
          s3Key,
          bucket: process.env.S3_PAYLOAD_BUCKET, // 수신측 편의를 위해 버킷명 명시 가능
        },
        timestamp: new Date().toISOString(),
      };

      logger.info({ userId, queueUrl: this.jobQueueUrl }, 'Sending job to SQS');
      await this.queuePort.sendMessage(this.jobQueueUrl, messageBody);

      // 5. 상태 관리 (선택 사항: 워커가 완료 알림을 줄 때까지 활성 상태 유지할지 정책 결정 필요)
      // 비동기 처리이므로 여기서는 activeUserTasks에 영원히 잡아두면 안됨(서버 재시작 시 꼬임).
      // 정확한 상태 관리를 위해서는 Redis나 DB에 'JobStatus' 테이블을 두는 것이 좋음.
      // 우선 데모 수준 호환성을 위해 잠시 추가했다가, 실제로는 워커 알림으로 해제해야 함.
      // 여기서는 큐에 넣는 성공 여부만 확인하므로 별도 Lock을 오래 걸지 않음.
      // FIXME > taskId를 꼭 반환해야 하나?

      return taskId;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to enqueue graph generation request');
      if (err instanceof AppError) throw err;
      throw new UpstreamError('Failed to request graph generation via queue', {
        cause: String(err),
      });
    }
  }

  /**
   * [New] SQS 기반 단일 대화 추가 요청
   * 단일 대화 데이터를 S3에 업로드하고, 작업 요청 메시지를 SQS에 발행합니다.
   *
   * @param userId 사용자 ID
   * @param conversationId 추가할 대화 ID
   * @returns 발행된 작업의 연관 ID (TaskId)
   */
  async requestAddConversationViaQueue(userId: string, conversationId: string): Promise<string> {
    try {
      const taskId = `task_add_conv_${userId}_${ulid()}`;
      const s3Key = `graph-generation/${taskId}/conversation.json`;

      logger.info({ userId, conversationId, taskId }, 'Preparing add conversation request');

      // 1. Fetch single conversation with messages
      const conversation = await this.chatManagementService.getConversation(conversationId, userId);

      if (!conversation) {
        throw new NotFoundError('Conversation not found');
      }

      // 2. Convert to AI input format (matching existing format)
      const messages: ChatMessage[] = conversation.messages;
      const mapping: Record<string, AiInputMappingNode> = {};

      let prevMsgId: string | null = null;

      // Sort messages by createdAt
      messages.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      });

      // Build mapping structure
      for (const msg of messages) {
        const id = msg.id;
        mapping[id] = {
          id: id,
          message: {
            id: id,
            author: { role: msg.role },
            content: { content_type: 'text', parts: [msg.content] },
          },
          parent: prevMsgId,
          children: [],
        };

        if (prevMsgId && mapping[prevMsgId]) {
          mapping[prevMsgId].children.push(id);
        }

        prevMsgId = id;
      }

      const aiInputData: AiInputConversation = {
        id: conversation.id,
        conversation_id: conversation.id,
        title: conversation.title,
        create_time: conversation.createdAt ? new Date(conversation.createdAt).getTime() / 1000 : 0,
        update_time: conversation.updatedAt ? new Date(conversation.updatedAt).getTime() / 1000 : 0,
        mapping: mapping,
      };

      // 3. Upload to S3
      const payloadJson = JSON.stringify(aiInputData);
      await this.storagePort.upload(s3Key, payloadJson, 'application/json');

      // 4. Send SQS message
      const messageBody: AddConversationRequestPayload = {
        taskId,
        taskType: TaskType.ADD_CONVERSATION_REQUEST,
        payload: {
          userId,
          conversationId,
          s3Key,
          bucket: process.env.S3_PAYLOAD_BUCKET,
        },
        timestamp: new Date().toISOString(),
      };

      logger.info({ userId, conversationId, taskId }, 'Sending add conversation job to SQS');
      await this.queuePort.sendMessage(this.jobQueueUrl, messageBody);

      return taskId;
    } catch (err) {
      logger.error({ err, userId, conversationId }, 'Failed to queue add conversation request');
      if (err instanceof AppError) throw err;
      throw new UpstreamError('Failed to request add conversation via queue', {
        cause: String(err),
      });
    }
  }

  /**
   * [Local] Direct mode (no SQS/S3) for add-conversation
   */
  async requestAddConversationDirect(userId: string, conversationId: string): Promise<string> {
    try {
      const taskId = `task_add_conv_direct_${userId}_${ulid()}`;

      logger.info({ userId, conversationId, taskId }, 'Preparing add conversation request (Direct)');

      const conversation = await this.chatManagementService.getConversation(conversationId, userId);
      if (!conversation) {
        throw new NotFoundError('Conversation not found');
      }

      const aiInputData: AiInputConversation = toAiInputConversation(conversation);
      const clusters = await this.graphEmbeddingService.listClusters(userId);

      const inputData = {
        conversation: aiInputData,
        userId,
        existingClusters: clusters,
      };

      const aiResult = await this.httpClient.post<{
        nodes: any[];
        edges: any[];
        assignedCluster: {
          clusterId: string;
          isNewCluster: boolean;
          confidence: number;
          reasoning: string;
        };
      }>('/add-node', inputData);

      const existingNodes = await this.graphEmbeddingService.listNodes(userId);
      const nextNodeId =
        existingNodes.length > 0 ? Math.max(...existingNodes.map((n) => n.id)) + 1 : 1;

      const createdNodeIds: Map<number, number> = new Map();

      // 항상 1개의 노드만 추가
      for (const node of aiResult.nodes) {
        const tempId = node.id;  // -1 (AI 서버에서 설정한 임시 ID)
        createdNodeIds.set(tempId, nextNodeId);

        await this.graphEmbeddingService.upsertNode({
          id: nextNodeId,
          userId,
          origId: node.origId,
          clusterId: node.clusterId,
          clusterName: node.clusterName || '',
          numMessages: node.numMessages || 0,
          embedding: node.embedding || [],
          timestamp: node.timestamp || null,
        });
      }

      for (const edge of aiResult.edges) {
        const sourceId = createdNodeIds.get(edge.source) || edge.source;
        await this.graphEmbeddingService.upsertEdge({
          userId,
          source: sourceId,
          target: edge.target,
          weight: edge.weight || 1.0,
          type: edge.type || 'similarity',
          intraCluster: edge.intraCluster ?? false,
        });
      }

      logger.info({ taskId, userId, conversationId }, 'Conversation added to graph (Direct)');

      return taskId;
    } catch (err) {
      logger.error({ err, userId, conversationId }, 'Failed to add conversation to graph (Direct)');
      if (err instanceof AppError) throw err;
      throw new UpstreamError('Failed to request add conversation (Direct)', {
        cause: String(err),
      });
    }
  }

  /**
   * @deprecated 사용 금지 - SQS 도입 전 구 방식 (HTTP Streaming 직접 전송)
   * 사용자에 대한 그래프 생성 프로세스를 시작합니다.
   * 1. 사용자의 모든 대화와 메시지를 가져옵니다.
   * 2. 데이터를 AI 모듈이 예상하는 형식으로 변환합니다.
   * 3. 데이터를 AI 서버로 전송하여 분석 파이프라인을 시작합니다.
   * 4. 작업 ID를 즉시 반환합니다.
   * 5. 백그라운드 폴링 프로세스를 시작하여 결과를 기다리고 저장합니다.
   *
   * @param userId 사용자 ID.
   * @returns AI 서버가 할당한 작업 ID.
   */
  async generateGraphForUser(userId: string): Promise<string> {
    try {
      // 중복 요청 방지
      if (this.activeUserTasks.has(userId)) {
        logger.warn({ userId }, 'Graph generation already in progress for user');
        throw new ConflictError('Graph generation is already in progress for this user.', {
          status: 'processing',
        });
      }

      // 사용자를 활성 상태로 표시
      this.activeUserTasks.add(userId);
      logger.info({ userId }, 'Starting graph generation for user (Streaming Mode)');

      // 2. AI 서버로 전송 (재시도 로직 적용)
      logger.info({ userId }, 'Sending data stream to AI server');
      let taskId: string | undefined;

      const MAX_RETRIES = 5;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // [중요] 스트림은 한 번 소비되면 재사용할 수 없으므로, 재시도 시마다 새로 생성해야 합니다.
          // [개념 설명: Node.js Readable Stream]
          // - Readable.from()은 Async Iterable(여기서는 제너레이터)을 Node.js의 읽기 가능한 스트림으로 변환합니다.
          // - 스트림은 데이터를 한 번에 메모리에 올리지 않고, 소비되는 속도에 맞춰 조금씩 데이터를 '흘려보내는' 방식입니다.
          const dataStream = Readable.from(this.streamUserData(userId));

          // Axios는 Readable Stream을 요청 바디로 지원합니다.
          const response = await this.httpClient.post<{ task_id: string; status: string }>(
            '/analysis',
            dataStream
          );
          taskId = response.task_id;
          break; // 성공 시 루프 탈출
        } catch (err) {
          // 재시도 불가능한 에러인지 확인 (4xx 클라이언트 에러 등)
          let isRetryable = true;
          if (err instanceof UpstreamError && err.details?.status) {
            const status = err.details.status;
            // 400번대 에러는 재시도하지 않음
            if (status >= 400 && status < 500) {
              isRetryable = false;
            }
          }

          // 마지막 시도이거나 재시도 불가능한 에러인 경우
          if (!isRetryable || attempt === MAX_RETRIES) {
            logger.error(
              { err, userId, attempt },
              'Failed to send data to AI server (Final attempt)'
            );
            throw err;
          }

          logger.warn(
            { err, userId, attempt },
            `Failed to send data to AI server. Retrying in ${attempt * 1000}ms...`
          );
          // 지수 백오프: 1초, 2초... 대기
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }

      if (!taskId) throw new Error('Task ID not received from AI server');

      logger.info({ userId, taskId }, 'AI task started');

      // // 사용자를 활성 상태로 표시
      // this.activeUserTasks.add(userId);

      // 3. 폴링 시작
      // 참고: 여러 인스턴스가 있는 프로덕션 환경에서는 이 폴링을 별도의 워커가 처리하거나
      // 결과가 웹훅/큐를 통해 푸시되어야 합니다.
      // 이 데모에서는 인메모리 폴링.
      this.pollAndSave(taskId, userId).catch((err) => {
        logger.error({ err, taskId, userId }, 'Failed to poll and save graph data');
        this.activeUserTasks.delete(userId);
      });

      return taskId;
    } catch (err: unknown) {
      this.activeUserTasks.delete(userId);
      logger.error({ err, userId }, 'Error in generateGraphForUser');
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.getConversation failed', { cause: String(err) });
    }
  }

  /**
   *
   * 사용자 대화 데이터를 AI 입력 형식으로 변환하여 스트리밍하는 제너레이터
   * JSON 구조: { "data": [ ... ] }
   *
   * [개념 설명: Async Generator (async function*)]
   * - 제너레이터는 함수 실행을 중간에 멈췄다가 재개할 수 있는 함수입니다.
   * - 'yield' 키워드를 만나면 값을 반환하고 실행을 일시 정지합니다.
   * - 스트림이 데이터를 요청하면 다시 깨어나서 다음 로직을 수행합니다.
   * - 이 패턴을 사용하면 DB에서 전체 데이터를 다 가져오지 않고도(Lazy Loading),
   *   필요한 만큼만 조금씩 가져와서 처리할 수 있어 메모리 효율이 극대화됩니다.
   */
  private async *streamUserData(userId: string): AsyncGenerator<string> {
    // [개념 설명: JSON Streaming]
    // 거대한 객체를 한 번에 JSON.stringify() 하면 메모리 부족(OOM)이 발생할 수 있습니다.
    // 따라서 JSON의 문자열 구조(괄호, 콤마 등)를 수동으로 쪼개서 스트림으로 보냅니다.
    yield '[';

    let isFirst = true;
    let cursor: string | undefined = undefined;
    const BATCH_SIZE = 50; // 한 번에 메모리에 올릴 대화 개수

    while (true) {
      // [Batch Processing] DB에서 데이터를 조금씩(Pagination) 가져옵니다.
      const result = await this.chatManagementService.listConversations(userId, BATCH_SIZE, cursor);
      const batchConversations = result.items;

      for (const conv of batchConversations) {
        const messages: ChatMessage[] = conv.messages;
        const mapping: Record<string, AiInputMappingNode> = {};

        let prevMsgId: string | null = null;

        // 메시지 정렬 (createdAt 기준)
        messages.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeA - timeB;
        });

        for (const msg of messages) {
          const id = msg.id;
          mapping[id] = {
            id: id,
            message: {
              id: id,
              author: { role: msg.role },
              content: { content_type: 'text', parts: [msg.content] },
            },
            parent: prevMsgId,
            children: [],
          };

          if (prevMsgId && mapping[prevMsgId]) {
            mapping[prevMsgId].children.push(id);
          }

          prevMsgId = id;
        }

        //FIXED: id 필드 추가
        const aiItem: AiInputConversation = {
          id: conv.id,
          conversation_id: conv.id,
          title: conv.title,
          create_time: conv.createdAt ? new Date(conv.createdAt).getTime() / 1000 : 0,
          update_time: conv.updatedAt ? new Date(conv.updatedAt).getTime() / 1000 : 0,
          mapping: mapping,
        };

        if (!isFirst) {
          yield ','; // 아이템 사이의 구분자
        }
        // 개별 아이템만 문자열로 변환하여 전송 (메모리 절약)
        yield JSON.stringify(aiItem);
        isFirst = false;
      }

      if (!result.nextCursor) {
        break;
      }
      cursor = result.nextCursor;
    }

    yield ']'; // JSON 종료
  }

  /**
   * @deprecated SQS 도입 전 구 방식 (사용 금지)
   * AI 서버에 작업 상태를 주기적으로 폴링합니다.
   * 작업이 완료되면 결과를 가져와 데이터베이스에 저장합니다.
   *
   * @param taskId AI 서버에서 발급받은 작업 고유 ID. 상태 조회 및 결과 수령에 사용됩니다.
   * @param userId 작업을 요청한 사용자 ID. 작업 완료 후 상태 해제 및 로깅에 사용됩니다.
   */
  private async pollAndSave(taskId: string, userId: string) {
    const POLLING_INTERVAL = 30000; // 30초
    const MAX_ATTEMPTS = 120; // 60분 (120 * 30초 = 3600초)
    const MAX_CONSECUTIVE_ERRORS = 5; // 연속 에러 허용 횟수 (5번 연속 실패 시 중단)

    let attempts = 0;
    let consecutiveErrors = 0;

    const checkStatus = async () => {
      // 최대 시도 횟수 초과 시 폴링 중단
      if (attempts >= MAX_ATTEMPTS) {
        logger.error({ taskId, userId }, 'Polling timed out');
        // 사용자 작업 상태 해제 (재요청 가능하도록)
        this.activeUserTasks.delete(userId);
        return;
      }

      attempts++;

      try {
        // AI 서버에 현재 작업 상태 조회 요청 (GET /status/:taskId)
        const statusRes = await this.httpClient.get<{ task_id: string; status: string }>(
          `/status/${taskId}`
        );

        // 성공 시 연속 에러 카운트 초기화
        consecutiveErrors = 0;

        if (statusRes.status === 'completed') {
          logger.info({ taskId, userId }, 'AI task completed. Fetching result...');

          // 결과 데이터 조회 요청 (GET /result/:taskId)
          // AI 서버의 원시 출력 포맷(AiGraphOutputDto)으로 수신
          const rawResult = await this.httpClient.get<AiGraphOutputDto>(`/result/${taskId}`);

          // 원시 출력을 내부 표준 GraphSnapshotDto로 변환 (Mapper 사용)
          const snapshot: GraphSnapshotDto = mapAiOutputToSnapshot(rawResult, userId);

          // DB 저장을 위한 페이로드 구성
          const payload: PersistGraphPayloadDto = {
            userId: userId,
            snapshot: snapshot,
          };

          // GraphEmbeddingService를 통해 스냅샷 데이터를 DB에 저장 (트랜잭션 처리됨)
          await this.graphEmbeddingService.persistSnapshot(payload);
          logger.info({ taskId, userId }, 'Graph data successfully saved to DB');

          // 사용자 작업 상태 해제 (재요청 가능하도록)
          this.activeUserTasks.delete(userId);
        } else if (statusRes.status === 'failed') {
          // 상태가 'failed' (실패)인 경우
          logger.error({ taskId, userId }, 'AI Task failed on server side');
          // 사용자 작업 상태 해제
          this.activeUserTasks.delete(userId);
        } else {
          // 아직 진행 중인 경우
          // 일정 시간(POLLING_INTERVAL) 후 다시 checkStatus 실행 (재귀 호출)
          setTimeout(checkStatus, POLLING_INTERVAL);
        }
      } catch (err) {
        // 폴링 중 에러 발생 시 (네트워크 오류 등)
        consecutiveErrors++;
        logger.error({ err, taskId, consecutiveErrors }, 'Error during polling');

        // 1. 명확한 클라이언트 에러 (404, 4xx) -> 즉시 중단
        // 404: 작업이 사라짐 (서버 재시작으로 인한 메모리 초기화 등)
        if (err instanceof UpstreamError && err.details?.status) {
          const status = err.details.status;
          if (status === 404 || (status >= 400 && status < 500)) {
            logger.error(
              { taskId, userId, status },
              'Polling stopped due to client error (e.g. Task Not Found)'
            );
            this.activeUserTasks.delete(userId);
            return;
          }
        }

        // 2. 연속된 서버 에러 (5xx, 네트워크 등) -> 일정 횟수 이상이면 중단
        // 일시적인 네트워크/서버 장애는 재시도하지만, 계속되면 포기
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logger.error(
            { taskId, userId, consecutiveErrors },
            'Polling stopped due to too many consecutive errors'
          );
          this.activeUserTasks.delete(userId);
          return;
        }

        // 에러가 발생해도 계속 재시도 (일시적 오류일 수 있음)
        setTimeout(checkStatus, POLLING_INTERVAL);
      }
    };

    // 폴링 시작
    setTimeout(checkStatus, POLLING_INTERVAL);
  }

  /**
   * @deprecated 사용 금지 - SQS 도입 전 구 방식
   * [테스트용] JSON 데이터를 직접 입력받아 그래프 생성을 요청합니다.
   * DB 조회 과정을 생략하고, 클라이언트가 제공한 데이터를 그대로 AI 서버로 전송합니다.
   *
   * @param userId 사용자 ID (결과 저장용)
   * @param inputData AI 입력 데이터 (AiInputData 형식)
   * @returns AI 서버가 할당한 작업 ID
   */
  async generateGraphFromJson(inputData: AiInputData): Promise<string> {
    const userId = 'test-user'; // 테스트용 고정 사용자 ID

    if (this.activeUserTasks.has(userId)) {
      logger.warn({ userId }, 'Graph generation already in progress for user');
      throw new ConflictError('Graph generation is already in progress for this user.', {
        status: 'processing',
      });
    }

    logger.info({ userId }, 'Starting test graph generation from JSON');

    // 2. AI 서버로 전송 (데이터 변환 과정 생략)
    logger.info({ userId }, 'Sending provided JSON data to AI server');
    let taskId: string;
    try {
      const response = await this.httpClient.post<{ task_id: string; status: string }>(
        '/analysis',
        { data: inputData }
      );
      taskId = response.task_id;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to start AI analysis task');
      throw error;
    }

    logger.info({ userId, taskId }, 'AI task started (Test Mode)');

    // 사용자를 활성 상태로 표시
    this.activeUserTasks.add(userId);

    // 3. 폴링 시작
    this.pollAndSave(taskId, userId).catch((err) => {
      logger.error({ err, taskId, userId }, 'Failed to poll and save graph data');
      this.activeUserTasks.delete(userId);
    });

    return taskId;
  }
}
