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

import { logger } from '../shared/utils/logger';
import { loadEnv } from '../config/env';
import { Container } from '../bootstrap/container'; // 기존 DI 컨테이너 재사용
import { QueueMessage, TaskType } from '../shared/dtos/queue';

// Handlers
import { JobHandler } from './handlers/JobHandler';
import { GraphGenerationResultHandler } from './handlers/GraphGenerationResultHandler';

async function startWorker() {
  const env = loadEnv();
  logger.info('Starting Worker Process...');

  // 1. Initialize Dependency Container
  // API 서버와 동일한 설정을 사용하여 DB, Redis, S3 등의 연결을 맺습니다.
  const container = Container.getInstance();
  
  // 중요: DB 연결 등 비동기 초기화가 필요할 수 있음
  // Container 클래스에 initializeAsync 같은게 없다면, 서비스들이 Lazy loading되거나
  // 생성자에서 초기화되는지 확인 필요.
  // Repository들이 내부적으로 DB 커넥션 풀을 잘 쓰는지 점검했다고 가정.

  // 2. Handler Registry (Strategy Pattern)
  // 메시지 타입에 따라 적절한 핸들러를 매핑합니다.
  const handlers: Record<string, JobHandler> = {
    [TaskType.GRAPH_GENERATION_RESULT]: new GraphGenerationResultHandler(),
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
      }
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

        logger.info({ taskId, taskType }, 'Worker received message');

        // 핸들러 라우팅
        const handler = handlers[taskType];
        if (!handler) {
          logger.warn({ taskType }, 'No handler found for task type. Skipping.');
          return message; // 핸들러가 없으면 삭제 처리 (ACK)
        }

        // 핸들러 실행 (Container 주입)
        await handler.handle(body, container);

        // 정상 처리 완료 시 메시지 반환 -> SQS Consumer가 삭제(ACK) 수행
        return message;

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
}

// 5. Run
startWorker().catch(err => {
  logger.error({ err }, 'Fatal error in worker process');
  process.exit(1);
});

