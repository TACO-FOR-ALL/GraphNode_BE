/**
 * Import finalize SQS 메시지 처리.
 */
import type { Container } from '../../bootstrap/container';
import type { ImportFinalizeQueueMessage } from '../../shared/dtos/importFinalize';
import { logger } from '../../shared/utils/logger';

export class ImportFinalizeHandler {
  async handle(message: ImportFinalizeQueueMessage, container: Container): Promise<void> {
    const { jobId, userId, resultS3Key, provider } = message;
    logger.info({ jobId, userId }, 'Processing import finalize message');
    const processor = container.getImportFinalizeProcessor();
    await processor.process(userId, jobId, resultS3Key, provider);
  }
}
