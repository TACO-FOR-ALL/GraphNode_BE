/**
 * Worker Entry Point
 *
 * 책임:
 * - 백그라운드 작업 처리를 위한 워커 프로세스를 시작합니다.
 * - SQS 메시지를 폴링하고, 각 메시지 타입에 맞는 핸들러(프로세서)를 호출합니다.
 * - 이 파일은 서버(API)와 별도로 실행되어야 합니다. (e.g. `ts-node src/workers/index.ts`)
 */
import { Consumer } from 'sqs-consumer';
import { SQSClient } from '@aws-sdk/client-sqs';
import * as Sentry from '@sentry/node';

import { logger } from '../shared/utils/logger';
import { loadEnv } from '../config/env';
import { initDatabases } from '../infra/db';
import { Container } from '../bootstrap/container';
import { QueueMessage, TaskType } from '../shared/dtos/queue';
import { requestStore } from '../shared/context/requestStore';
import { initSentry } from '../shared/utils/sentry';
// Handlers
import { JobHandler } from './handlers/JobHandler';
import { GraphGenerationResultHandler } from './handlers/GraphGenerationResultHandler';
import { GraphSummaryResultHandler } from './handlers/GraphSummaryResultHandler';

async function startWorker() {
  initSentry();
  const env = loadEnv();
  console.log('Worker process starting...'); // Direct stdout for debugging
  logger.info('Starting Worker Process...');

  // 1. Initialize Databases (Redis, Mongo, Prisma)
  // This is required for RedisEventBusAdapter and Repositories to work.
  await initDatabases();
  
  // 2. Initialize Dependency Container
  const container : Container = Container.getInstance();

  // 중요: DB 연결 등 비동기 초기화가 필요할 수 있음
  // Container 클래스에 initializeAsync 같은게 없다면, 서비스들이 Lazy loading되거나
  // 생성자에서 초기화되는지 확인 필요.
  // Repository들이 내부적으로 DB 커넥션 풀을 잘 쓰는지 점검했다고 가정.

  // 2. Handler Registry (Strategy Pattern)
  // 메시지 타입에 따라 적절한 핸들러를 매핑합니다.
  const handlers: Record<string, JobHandler> = {
    [TaskType.GRAPH_GENERATION_RESULT]: new GraphGenerationResultHandler(),
    [TaskType.GRAPH_SUMMARY_RESULT]: new GraphSummaryResultHandler(),
    // 추후 추가: [TaskType.OTHER_TASK]: new OtherTaskHandler(),
  };

  const queueUrl = env.SQS_RESULT_QUEUE_URL || '';
  if (!queueUrl) {
    logger.error('SQS_RESULT_QUEUE_URL is not defined in environment variables');
    process.exit(1);
  }

  // 3. SQS Consumer Setup
  const app = Consumer.create({
    queueUrl: queueUrl,
    region: env.AWS_REGION || 'ap-northeast-2', // env.ts에 region이 없다면 기본값
    sqs: new SQSClient({
      region: env.AWS_REGION || 'ap-northeast-2',
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
      },
    }),
    /**
     * 메시지 처리 메인 로직 Override?
     */
    handleMessage: async (message) => {
      try {
        if (!message.Body) {
          return message; // Body 없는 메시지는 삭제 처리 (ACK)
        }

        // JSON 파싱
        const body = JSON.parse(message.Body) as QueueMessage;
        const { taskType, taskId } = body;
        const payload = (body as any).payload;
        // 컨텍스트(Context) 정보 구성
        // Worker는 HTTP 요청을 받지 않으므로, 큐 메시지 데이터를 활용하여 가상의 요청 컨텍스트를 만듭니다.
        const ctx = {
          correlationId: taskId,     // 로그 추적 시 이 작업을 식별하기 위한 고유 ID (Trace ID 역할)
          userId: payload?.userId,   // 작업을 요청한 사용자 ID
        };

        /**
         * 1. requestStore.run(ctx, callback)
         * 
         * [역할]
         * Node.js의 AsyncLocalStorage를 기반으로 동작하며, 이 스코프 안에서 실행되는 모든 비동기 작업(DB 접근, S3 업로드 등)에 
         * `ctx` 객체 내의 데이터(correlationId, userId 등)를 공유합니다. 
         * 
         * [왜 필요한가?]
         * Service 계층의 비동기 함수들 내부에서 매번 파라미터로 userId나 taskId를 넘기지 않아도,
         * auditProxy(감사 로거)가 내부적으로 `requestStore.getStore()`를 호출하여 누가(userId), 어떤 작업 맥락(correlationId)에서 
         * 해당 서비스 함수를 호출했는지 알아내고 표준화된 양식으로 로그를 남길 수 있게 해줍니다.
         */
        return requestStore.run(ctx, async () => {
          
          /**
           * 2. Sentry.withIsolationScope(callback)
           * 
           * [역할]
           * Sentry의 전역(Global) Scope와 분리된, 현재 메시지 처리에만 적용되는 독립적인 에러/태그 추적 스코프를 만듭니다.
           * 
           * [왜 필요한가?]
           * Worker 프로세스는 여러 개의 큐 메시지를 동시에 비동기로 처리할 수 있습니다.
           * 만약 격리(Isolation) 스코프를 만들지 않으면, A 메시지 처리 중에 세팅한 태그(Tag)나 사용자 정보가 
           * 뜻하지 않게 동시에 처리 중인 B 메시지의 에러 모니터링 데이터에 섞여 들어가는(Data Bleed) 문제가 발생합니다.
           */
          return Sentry.withIsolationScope(async (isolationScope) => {
            // 이 스코프 안에서 발생하는 모든 에러/로그에는 현재 작업의 타입과 사용자 정보가 자동으로 태그(Tagging)됩니다.
            isolationScope.setTag('task_type', taskType);
            if (payload?.userId) isolationScope.setUser({ id: payload.userId });

            /**
             * 3. Sentry.startSpan(..., callback)
             * 
             * [역할]
             * Sentry의 트랜잭션/스팬(Span) 범위를 명시적으로 지정합니다. (작업 단위 묶음 생성)
             * 콜백 함수가 실행되는 총 소요 시간(Duration)과 상태를 측정하여 Sentry 대시보드의 "Performance" 탭에 보여줍니다.
             */
            return Sentry.startSpan(
              { name: `SQS Worker: ${taskType}`, op: 'queue.process' },
              async () => {
                logger.info({ taskId, taskType }, 'Worker received message');

                // 핸들러 라우팅
                const handler = handlers[taskType];
                if (!handler) {
                  logger.warn({ taskType }, 'No handler found for task type. Skipping.');
                  return message; // 핸들러가 없으면 삭제 처리 (ACK)
                }

                try {
                  // 핸들러 실행 (Container 주입)
                  await handler.handle(body, container);

                  // 정상 처리 완료 시 메시지 반환 -> SQS Consumer가 삭제(ACK) 수행
                  return message;
                } catch (err) {
                  Sentry.captureException(err);
                  throw err;
                }
              }
            );
          });
        });
      } catch (err) {
        logger.error({ err, messageId: message.MessageId }, 'Error handling message');
        throw err; // 에러를 던져야 SQS Consumer가 재시도 로직을 수행함 (ACK 안함)
      }
    },
    // 기타 설정
    batchSize: 10, // 한 번에 최대 10개 가져옴
    waitTimeSeconds: 20, // Long polling
  });

  // 에러 이벤트 리스너
  app.on('error', (err) => {
    logger.error({ err }, 'SQS Consumer Error');
  });

  app.on('processing_error', (err) => {
    logger.error({ err }, 'SQS Processing Error');
  });

  // 4. Start
  app.start();
  logger.info({ queueUrl }, 'Worker is running and polling SQS...');

  // -------------------------------------------------------------------------------- //
  //  [Graceful Shutdown 로직 추가]
  //  AWS Fargate 컨테이너가 1시간 시간제한, 스케일인(Scale-in) 또는 배포로 인해 꺼질 때
  //  OS가 보내는 SIGTERM 신호를 감지하고, "현재 처리 중이던 10개의 작업"이 모두
  //  안전하게 끝날 때까지만 기다린 뒤 프로세스를 종료하도록 만듭니다.
  // -------------------------------------------------------------------------------- //
  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    // app.stop()은 SQS에서 새로운 메시지 가져오는 것(Polling)을 즉시 중단합니다.
    // 단, 이미 가져와서 비동기 처리 중이던 메시지가 있다면 그것이 모두 완료될 때까지 대기(Await)합니다.
    app.stop(); 
    
    // 타임아웃 30초 설정 (Fargate의 일반적인 강제 종료 타겟 시간)
    // 30초 내에 안 끝나면 강제 종료
    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out (30s). Forcing exit.');
      process.exit(1);
    }, 30000);

    // sqs-consumer의 'stopped' 이벤트는 기존 작업들이 모두 마무리되고
    // 완전히 폴링 루프가 안전하게 닫혔을 때 발생합니다.
    app.on('stopped', () => {
      clearTimeout(forceExitTimer);
      logger.info('Graceful shutdown complete. All pending tasks finished. Exiting.');
      process.exit(0);
    });
  };

  // ECS, Docker가 컨테이너를 중지시킬 때 보내는 신호들
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT',  () => handleShutdown('SIGINT'));
}

// 5. Run
startWorker().catch((err) => {
  logger.error({ err }, 'Fatal error in worker process');
  process.exit(1);
});
