import { Readable } from 'stream';

import { ChatManagementService } from './ChatManagementService';
import { GraphEmbeddingService } from './GraphEmbeddingService';
import { HttpClient } from '../../infra/http/httpClient';
import { AiInputData, AiInputMappingNode } from '../../shared/dtos/ai_input';
import { logger } from '../../shared/utils/logger';
import { PersistGraphPayloadDto } from '../../shared/dtos/graph';
import { ConflictError } from '../../shared/errors/domain';
import { ChatMessage } from '../../shared/dtos/ai';

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
    // 타임아웃 5분(300초)으로 설정
    this.httpClient = new HttpClient('GraphAI', { 
      baseURL: AI_SERVER_URI,
      timeout: 300000 
    });
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

    logger.info({ userId }, 'Starting graph generation for user (Streaming Mode)');

    // 1. 데이터 스트림 생성 (메모리 최적화: 제너레이터를 통해 필요할 때만 데이터 생성)
    // [개념 설명: Node.js Readable Stream]
    // - Readable.from()은 Async Iterable(여기서는 제너레이터)을 Node.js의 읽기 가능한 스트림으로 변환합니다.
    // - 스트림은 데이터를 한 번에 메모리에 올리지 않고, 소비되는 속도에 맞춰 조금씩 데이터를 '흘려보내는' 방식입니다.
    // - 이를 통해 100MB가 넘는 데이터도 수십 MB 수준의 낮은 메모리로 처리할 수 있습니다.
    const dataStream = Readable.from(this.streamUserData(userId));

    // 2. AI 서버로 전송
    logger.info({ userId }, 'Sending data stream to AI server');
    let taskId: string;
    try {
      // Axios는 Readable Stream을 요청 바디로 지원합니다.
      const response = await this.httpClient.post<{ task_id: string; status: string }>('/analysis', dataStream);
      taskId = response.task_id;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to start AI analysis task');
      throw error;
    }

    logger.info({ userId, taskId }, 'AI task started');

    // 사용자를 활성 상태로 표시
    this.activeUserTasks.add(userId);

    // 3. 폴링 시작 
    // 참고: 여러 인스턴스가 있는 프로덕션 환경에서는 이 폴링을 별도의 워커가 처리하거나
    // 결과가 웹훅/큐를 통해 푸시되어야 합니다.
    // 이 데모에서는 인메모리 폴링.
    this.pollAndSave(taskId, userId).catch(err => {
      logger.error({ err, taskId, userId }, 'Failed to poll and save graph data');
      this.activeUserTasks.delete(userId);
    });

    return taskId;
  }

  /**
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
    yield '{"data":[';
    
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
          const nodeId = msg.id;
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

        const aiItem = {
          title: conv.title,
          create_time: conv.createdAt ? new Date(conv.createdAt).getTime() / 1000 : 0,
          update_time: conv.updatedAt ? new Date(conv.updatedAt).getTime() / 1000 : 0,
          mapping: mapping
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

    yield ']}'; // JSON 종료
  }

  /**
   * AI 서버에 작업 상태를 주기적으로 폴링합니다.
   * 작업이 완료되면 결과를 가져와 데이터베이스에 저장합니다.
   * 
   * @param taskId AI 서버에서 발급받은 작업 고유 ID. 상태 조회 및 결과 수령에 사용됩니다.
   * @param userId 작업을 요청한 사용자 ID. 작업 완료 후 상태 해제 및 로깅에 사용됩니다.
   */
  private async pollAndSave(taskId: string, userId: string) {
    const POLLING_INTERVAL = 60000; // 60초
    const MAX_ATTEMPTS = 60; // 60분 (60 * 60초 = 3600초)
    
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

  /**
   * [테스트용] JSON 데이터를 직접 입력받아 그래프 생성을 요청합니다.
   * DB 조회 과정을 생략하고, 클라이언트가 제공한 데이터를 그대로 AI 서버로 전송합니다.
   * 
   * @param userId 사용자 ID (결과 저장용)
   * @param inputData AI 입력 데이터 (AiInputData 형식)
   * @returns AI 서버가 할당한 작업 ID
   */
  async generateGraphFromJson(inputData: AiInputData): Promise<string> {
    
    const userId = "test-user"; // 테스트용 고정 사용자 ID
    
    if (this.activeUserTasks.has(userId)) {
      logger.warn({ userId }, 'Graph generation already in progress for user');
      throw new ConflictError('Graph generation is already in progress for this user.', { status: 'processing' });
    }

    logger.info({ userId }, 'Starting test graph generation from JSON');

    // 2. AI 서버로 전송 (데이터 변환 과정 생략)
    logger.info({ userId }, 'Sending provided JSON data to AI server');
    let taskId: string;
    try {
      const response = await this.httpClient.post<{ task_id: string; status: string }>('/analysis', { data: inputData });
      taskId = response.task_id;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to start AI analysis task');
      throw error;
    }

    logger.info({ userId, taskId }, 'AI task started (Test Mode)');

    // 사용자를 활성 상태로 표시
    this.activeUserTasks.add(userId);

    // 3. 폴링 시작
    this.pollAndSave(taskId, userId).catch(err => {
      logger.error({ err, taskId, userId }, 'Failed to poll and save graph data');
      this.activeUserTasks.delete(userId);
    });

    return taskId;
  }
}
