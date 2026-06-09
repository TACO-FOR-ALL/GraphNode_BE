/**
 * Import finalize SQS 메시지 처리.
 */
import * as Sentry from '@sentry/node';

import type { Container } from '../../bootstrap/container';
import type { ImportFinalizeQueueMessage } from '../../shared/dtos/importFinalize';
import { AppError } from '../../shared/errors/base';
import { logger } from '../../shared/utils/logger';
import { summarizeMongoError } from '../../shared/utils/mongoError';

export class ImportFinalizeHandler {
  async handle(message: ImportFinalizeQueueMessage, container: Container): Promise<void> {
    const { jobId, userId, resultS3Key, provider } = message;
    logger.info({ jobId, userId, resultS3Key, provider }, 'Processing import finalize message');

    try {
      const processor = container.getImportFinalizeProcessor();
      await processor.process(userId, jobId, resultS3Key, provider);
    } catch (err) {
      Sentry.withScope((scope) => {
        scope.setTag('worker_handler', 'ImportFinalizeHandler');
        scope.setTag('job_id', jobId);
        scope.setTag('user_id', userId);
        if (err instanceof AppError) {
          scope.setTag('error_code', err.code);
        }
        scope.setContext('import_finalize', {
          jobId,
          userId,
          resultS3Key,
          provider,
          ...summarizeMongoError(err),
        });
        Sentry.captureException(err);
      });

      logger.error(
        { err, jobId, userId, resultS3Key, ...summarizeMongoError(err) },
        'Import finalize handler failed'
      );
      throw err;
    }
  }
}
