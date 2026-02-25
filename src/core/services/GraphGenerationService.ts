import { Readable } from 'stream';
import { ulid } from 'ulid';

import { ChatManagementService } from './ChatManagementService';
import { GraphEmbeddingService } from './GraphEmbeddingService';
import { UserService } from './UserService';
import { NotificationService } from './NotificationService';
import { NotificationType } from '../../workers/notificationType';
import { HttpClient } from '../../infra/http/httpClient';
import { AiInputConversation, AiInputMappingNode } from '../../shared/dtos/ai_input';
import { logger } from '../../shared/utils/logger';
import { AppError, UpstreamError, NotFoundError, GraphNotFoundError } from '../../shared/errors/domain';
import { ChatMessage } from '../../shared/dtos/ai';
import { mapSnapshotToAiInput } from '../../shared/mappers/graph_ai_input.mapper';
import { GraphGenRequestPayload, GraphSummaryRequestPayload, AddNodeRequestPayload, TaskType } from '../../shared/dtos/queue';
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
  createdAt?: Date | string;
  updatedAt?: Date | string;
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
  private readonly httpClient: HttpClient; // FIXME TODO : HTTP Client 사용하지 않고 SQS로만 통신하도록 변경
  private readonly activeUserTasks = new Set<string>();
  private readonly jobQueueUrl: string;

  constructor(
    private readonly chatManagementService: ChatManagementService,
    private readonly graphEmbeddingService: GraphEmbeddingService,
    private readonly userService: UserService,
    private readonly queuePort: QueuePort,
    private readonly storagePort: StoragePort,
    private readonly notificationService: NotificationService
  ) {
    const env = loadEnv();
    // 타임아웃 5분(300초)으로 설정
    // FIXME TODO : HTTP Client 사용하지 않고 SQS로만 통신하도록 변경
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
    let taskId: string | undefined;
    try {
      // 1. 중복 요청 방지 확인(SQS 방식 + ALB 스케일링 때문에 판별 불가)
      // if (this.activeUserTasks.has(userId)) {
      //   logger.warn({ userId }, 'Graph generation already in progress for user');
      //   throw new ConflictError('Graph generation is already in progress for this user.', { status: 'processing' });
      // }

      // 2.TaskId 생성 (UUID 등 사용 권장, 여기서는 간단히 timestamp 기반)
      taskId = `task_${userId}_${ulid()}`;
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


      // SQS에 Message 전달 완료 후에 성공 Notification 전송
      await this.notificationService.sendNotification(userId, NotificationType.GRAPH_GENERATION_REQUESTED, {
        taskId,
        timestamp: new Date().toISOString(),
      });

      return taskId;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to enqueue graph generation request');

      // 에러 발생 시 실패 Notification 전송
      await this.notificationService.sendNotification(userId, NotificationType.GRAPH_GENERATION_REQUEST_FAILED, {
        taskId: taskId || 'unknown',
        error: String(err),
        timestamp: new Date().toISOString(),
      });

      if (err instanceof AppError) throw err;
      throw new UpstreamError('Failed to request graph generation via queue', {
        cause: String(err),
      });
    }
  }

  /**
   * [New] SQS 기반 그래프 요약 요청
   * 사용자의 대화 데이터를 S3에 업로드하고, 작업 요청 메시지를 SQS에 발행합니다.
   * @param userId 사용자 ID
   * @returns 발행된 작업의 연관 ID (TaskId)
   */
  async requestGraphSummary(userId: string): Promise<string> {
    try {
      // 1. Task ID 생성
      const taskId = `summary_${userId}_${ulid()}`;
      
      // 2. 최신 그래프 스냅샷 조회 (DB에서)
      const snapshot = await this.graphEmbeddingService.getSnapshotForUser(userId);
      if (!snapshot || snapshot.nodes.length === 0) {
        throw new GraphNotFoundError('Graph data not found for user. Please generate graph first.');
      }
      
      // 3. User Preferred Language 조회
      const language = await this.userService.getPreferredLanguage(userId);

      // 4. AI 입력 포맷으로 변환 -> JSON String
      const aiInput = mapSnapshotToAiInput(snapshot, language);
      const jsonPayload = JSON.stringify(aiInput);
      const dataStream = Readable.from([jsonPayload]); // Readable Stream 생성
      
      // 4. S3 업로드
      const s3Key = `graph-summary/${taskId}/graph.json`;
      const bucket = process.env.S3_PAYLOAD_BUCKET || 'graph-node-payloads';
      
      //logger.info({ userId, s3Key }, 'Uploading graph data for summary');
      await this.storagePort.upload(s3Key, dataStream, 'application/json');
      
      // 5. SQS 메시지 전송 (GRAPH_SUMMARY_REQUEST)
      const messageBody: GraphSummaryRequestPayload = {
        taskId,
        taskType: TaskType.GRAPH_SUMMARY_REQUEST,
        payload: {
          userId,
          graphS3Key: s3Key,
          bucket: bucket,
          // vectorDbS3Key: undefined // 필요 시 추가
          language: language,
        },
        timestamp: new Date().toISOString(),
      };
      
      logger.info({ userId, taskId, queue: this.jobQueueUrl }, 'Sending Summary Request to SQS');
      await this.queuePort.sendMessage(this.jobQueueUrl, messageBody);
      
      return taskId;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to requesting graph summary');
      if (err instanceof AppError) throw err;
      throw new UpstreamError('Request Graph Summary Failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 요약/인사이트 조회 (Delegation)
   */
  async getGraphSummary(userId: string) {
    return this.graphEmbeddingService.getGraphSummary(userId);
  }

  /**
   * 그래프 요약/인사이트 삭제 (Delegation)
   * @param userId 사용자 ID
   * @throws {UpstreamError} - 삭제 실패 시
   * @example
   * await graphGenerationService.deleteGraphSummary('u_123');
   */
  async deleteGraphSummary(userId: string, permanent?: boolean) {
    return this.graphEmbeddingService.deleteGraphSummary(userId, permanent);
  }

  async restoreGraphSummary(userId: string) {
    return this.graphEmbeddingService.restoreGraphSummary(userId);
  }

  /**
   * 해당 사용자의 모든 그래프 데이터 삭제 (Delegation)
   * @param userId 사용자 ID
   * @throws {UpstreamError} - 삭제 실패 시
   * @example
   * await graphGenerationService.deleteGraph('u_123');
   */
  async deleteGraph(userId: string, permanent?: boolean) {
    return this.graphEmbeddingService.deleteGraph(userId, permanent);
  }

  async restoreGraph(userId: string) {
    return this.graphEmbeddingService.restoreGraph(userId);
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
      const messageBody: AddNodeRequestPayload = {
        taskId,
        taskType: TaskType.ADD_NODE_REQUEST,
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
   * FIXME TODO : HTTP Client 사용하지 않고 SQS로만 통신하도록 변경, deprecated 써야?
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


}
