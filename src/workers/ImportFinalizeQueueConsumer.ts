/**
 * Import finalize 전용 SQS consumer (GraphNode BE worker 프로세스).
 */
import { Consumer } from 'sqs-consumer';
import { SQSClient } from '@aws-sdk/client-sqs';

import type { Container } from '../bootstrap/container';
import { loadEnv } from '../config/env';
import type { ImportFinalizeQueueMessage } from '../shared/dtos/importFinalize';
import { logger } from '../shared/utils/logger';
import { ImportFinalizeHandler } from './handlers/ImportFinalizeHandler';

export function startImportFinalizeQueueConsumer(container: Container): Consumer | null {
  const env = loadEnv();
  const queueUrl = env.SQS_IMPORT_FINALIZE_QUEUE_URL;
  if (!queueUrl) {
    logger.info('SQS_IMPORT_FINALIZE_QUEUE_URL not set — import finalize async disabled');
    return null;
  }

  const handler = new ImportFinalizeHandler();

  const app = Consumer.create({
    queueUrl,
    sqs: new SQSClient({
      region: env.AWS_REGION,
      endpoint: env.AWS_ENDPOINT_URL,
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
          : undefined,
    }),
    handleMessage: async (message) => {
      if (!message.Body) return message;
      const body = JSON.parse(message.Body) as ImportFinalizeQueueMessage;
      await handler.handle(body, container);
      return message;
    },
  });

  app.on('error', (err) => logger.error({ err }, 'Import finalize SQS consumer error'));
  app.on('processing_error', (err) =>
    logger.error({ err }, 'Import finalize message processing error')
  );

  app.start();
  logger.info({ queueUrl }, 'Import finalize queue consumer started');
  return app;
}
