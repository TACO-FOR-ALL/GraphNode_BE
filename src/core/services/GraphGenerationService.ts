import { ChatManagementService } from './ChatManagementService';
import { GraphEmbeddingService } from './GraphEmbeddingService';
import { HttpClient } from '../../infra/http/httpClient';
import { AiInputData, AiInputMappingNode } from '../../shared/dtos/ai_input';
import { logger } from '../../shared/utils/logger';
import { PersistGraphPayloadDto } from '../../shared/dtos/graph';
import { ConflictError } from '../../shared/errors/domain';
import { ChatThread } from '../../shared/dtos/ai';

// TODO: 이 설정은 설정 파일이나 환경 변수로 이동해야 합니다.
// 데모를 위해 AI 서버 URI를 하드코딩.
// 향후 개선 사항: 서비스 디스커버리 또는 로드 밸런서 사용.
// 또한 확장성과 신뢰성을 높이기 위해 메시지 큐(SQS) 사용을 고려.
const AI_SERVER_URI = process.env.AI_SERVER_URI || 'http://localhost:8000';

export class GraphGenerationService {
  private readonly httpClient: HttpClient;
  private readonly activeUserTasks = new Set<string>();

  constructor(
    private readonly chatManagementService: ChatManagementService,
    private readonly graphEmbeddingService: GraphEmbeddingService
  ) {
    this.httpClient = new HttpClient('GraphAI', { baseURL: AI_SERVER_URI });
  }

  /**
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
    if (this.activeUserTasks.has(userId)) {
      logger.warn({ userId }, 'Graph generation already in progress for user');
      throw new ConflictError('Graph generation is already in progress for this user.', { status: 'processing' });
    }

    logger.info({ userId }, 'Starting graph generation for user');

    // 1. 데이터 가져오기
    // ChatManagementService를 사용하여 모든 대화 목록을 페이지네이션으로 가져옵니다.
    const conversations: ChatThread[] = [];
    let cursor: string | undefined = undefined;
    const BATCH_SIZE = 50; // 한 번에 가져올 개수

    while (true) {
      const result = await this.chatManagementService.listConversations(userId, BATCH_SIZE, cursor);
      conversations.push(...result.items);
      
      if (!result.nextCursor) {
        break;
      }
      cursor = result.nextCursor;
    }
    
    const aiInputData: AiInputData = [];

    logger.info({ userId, count: conversations.length }, 'Fetched conversations');

    for (const conv of conversations) {
      // ChatManagementService를 통해 메시지 목록 조회
      const messages = await this.chatManagementService.getMessages(conv.id);
      
      // AI 입력 형식으로 변환
      const mapping: Record<string, AiInputMappingNode> = {};
      
      // 현재 MessageDoc에는 parentId가 없으므로 선형 대화로 가정합니다.
      // DB 구조가 트리를 지원하도록 변경되면 이 로직을 업데이트해야 합니다.
      let prevMsgId: string | null = null;
      
      // 만약을 대비해 createdAt으로 메시지를 정렬합니다.
      messages.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      });

      for (const msg of messages) {
        const nodeId = msg.id; // ChatMessage DTO uses 'id'
        mapping[nodeId] = {
          id: nodeId,
          message: {
            id: nodeId,
            author: { role: msg.role },
            content: { content_type: 'text', parts: [msg.content] }
          },
          parent: prevMsgId,
          children: []
        };
        
        if (prevMsgId && mapping[prevMsgId]) {
          mapping[prevMsgId].children.push(nodeId);
        }
        
        prevMsgId = nodeId;
      }

      aiInputData.push({
        title: conv.title,
        create_time: conv.createdAt ? new Date(conv.createdAt).getTime() / 1000 : 0, // ms to sec
        update_time: conv.updatedAt ? new Date(conv.updatedAt).getTime() / 1000 : 0,
        mapping: mapping
      });
    }

    // 2. AI 서버로 전송
    logger.info({ userId }, 'Sending data to AI server');
    let taskId: string;
    try {
      const response = await this.httpClient.post<{ task_id: string; status: string }>('/analysis', { data: aiInputData });
      taskId = response.task_id;
    } catch (error) {
      // 전송에 실패하면 사용자가 재시도하는 것을 막지 않아야 합니다.
      throw error;
    }

    logger.info({ userId, taskId }, 'AI task started');

    // 사용자를 활성 상태로 표시
    this.activeUserTasks.add(userId);

    // 3. 폴링 시작 (요청 컨텍스트에서 실행 후 잊음(Fire and Forget), 백그라운드에서 실행됨)
    // 참고: 여러 인스턴스가 있는 프로덕션 환경에서는 이 폴링을 별도의 워커가 처리하거나
    // 결과가 웹훅/큐를 통해 푸시되어야 합니다.
    // 이 데모에서는 인메모리 폴링으로 충분합니다.
    this.pollAndSave(taskId, userId).catch(err => {
      logger.error({ err, taskId, userId }, 'Failed to poll and save graph data');
      this.activeUserTasks.delete(userId);
    });

    return taskId;
  }

  /**
   * AI 서버에 작업 상태를 주기적으로 폴링합니다.
   * 작업이 완료되면 결과를 가져와 데이터베이스에 저장합니다.
   * 
   * @param taskId AI 서버에서 발급받은 작업 고유 ID. 상태 조회 및 결과 수령에 사용됩니다.
   * @param userId 작업을 요청한 사용자 ID. 작업 완료 후 상태 해제 및 로깅에 사용됩니다.
   */
  private async pollAndSave(taskId: string, userId: string) {
    const POLLING_INTERVAL = 5000; // 5초
    const MAX_ATTEMPTS = 360; // 30분 (360 * 5초 = 1800초)
    
    let attempts = 0;
    
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
        const statusRes = await this.httpClient.get<{ task_id: string; status: string }>(`/status/${taskId}`);
        
        if (statusRes.status === 'completed') {
          logger.info({ taskId, userId }, 'AI task completed. Fetching result...');
          
          // 결과 데이터 조회 요청 (GET /result/:taskId)
          const result = await this.httpClient.get<any>(`/result/${taskId}`);
          
          // DB 저장을 위한 페이로드 구성
          // 결과 구조는 GraphSnapshotDto와 일치한다고 가정
          const payload: PersistGraphPayloadDto = {
            userId: userId,
            snapshot: result
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
        logger.error({ err, taskId }, 'Error during polling');
        // 에러가 발생해도 계속 재시도 (일시적 오류일 수 있음)
        setTimeout(checkStatus, POLLING_INTERVAL);
      }
    };

    // 폴링 시작
    setTimeout(checkStatus, POLLING_INTERVAL);
  }
}
