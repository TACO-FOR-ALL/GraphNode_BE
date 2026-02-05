import type { Container } from '../../bootstrap/container';
import { QueueMessage, GraphSummaryResultPayload } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { JobHandler } from './JobHandler';

export class GraphSummaryResultHandler implements JobHandler {
  async handle(message: QueueMessage, container: Container): Promise<void> {
    const payload = message.payload as GraphSummaryResultPayload['payload'];
    const { taskId } = message;
    const { userId, status, summaryS3Key, error } = payload;
    const storagePort = container.getAwsS3Adapter();
    const graphService = container.getGraphEmbeddingService();
    const notiService = container.getNotificationService();

    logger.info({ taskId, userId, status }, 'Handling Graph Summary Result');

    try {
      if (status === 'FAILED') {
        logger.error({ taskId, userId, error }, 'Graph summary generation failed');
        // await notiService.sendNotification(userId, 'GRAPH_SUMMARY_FAILED', {
        //   taskId,
        //   error: error || 'Unknown error',
        //   timestamp: new Date().toISOString(),
        // });
        await notiService.sendFcmPushNotification(
          userId,
          'Graph Generation Failed',
          `Graph summary generation failed: ${error || 'Unknown error'}`,
          {
            taskId,
            status: 'FAILED',
          }
        );
        return;
      }

      if (status === 'COMPLETED' && summaryS3Key) {
        // 1. Download summary.json
        const summaryJson = await storagePort.downloadJson<any>(summaryS3Key);

        // 2. Persist to DB
        await graphService.upsertGraphSummary(userId, summaryJson);

        logger.info({ taskId, userId }, 'Graph summary persisted to DB');

        // 3. Send Notification
        // await notiService.sendNotification(userId, 'GRAPH_SUMMARY_COMPLETED', {
        //   taskId,
        //   timestamp: new Date().toISOString(),
        // });
        await notiService.sendFcmPushNotification(
          userId,
          'Graph Ready',
          'Your graph is ready',
          {
            taskId,
            status: 'COMPLETED',
          }
        );
      }
    } catch (err) {
      logger.error({ err, taskId, userId }, 'Error processing graph summary result');
      // Retry handling logic via SQS visibility timeout if needed
      throw err;
    }
  }
}
