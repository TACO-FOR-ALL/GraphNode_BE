import * as Sentry from '@sentry/node';

import type { Container } from '../../bootstrap/container';
import type { FileSummaryResultPayload, QueueMessage } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { JobHandler } from './JobHandler';
import { notifyWorkerFailed } from '../../shared/utils/discord';
import { withRetry } from '../../shared/utils/retry';

/**
 * `FILE_SUMMARY_RESULT` SQS 메시지 처리.
 *
 * - 실패: `user_files` 의 `summaryStatus`·`summaryError` 갱신
 * - 성공: 인라인 `summary` 또는 `summaryS3Key` JSON에서 본문 추출 후 저장
 */
export class FileSummaryResultHandler implements JobHandler {
  async handle(message: QueueMessage, container: Container): Promise<void> {
    const body = message as FileSummaryResultPayload;
    const { taskId } = body;
    const { userId, fileId, status, summary, summaryS3Key, error } = body.payload;

    const userFileRepo = container.getUserFileRepository();
    const storagePort = container.getAwsS3Adapter();

    logger.info({ taskId, userId, fileId, status }, 'FILE_SUMMARY_RESULT 처리 시작');

    if (status === 'FAILED' || error) {
      const errorMsg = error || 'AI 서버에서 알 수 없는 오류';
      logger.error({ taskId, userId, fileId, error: errorMsg }, '파일 요약 실패');

      Sentry.addBreadcrumb({
        type: 'error',
        category: 'worker.ai_failed',
        message: `FILE_SUMMARY_RESULT: FAILED`,
        data: { taskId, userId, fileId, errorMsg },
        level: 'warning',
      });

      const sentryEventId = Sentry.withScope((scope) => {
        scope.setLevel('warning');
        scope.setTag('task_type', 'FILE_SUMMARY_RESULT');
        scope.setTag('correlation_id', taskId);
        return Sentry.captureMessage(`[Worker FAILED] FILE_SUMMARY_RESULT: ${errorMsg}`, 'warning');
      });

      void notifyWorkerFailed({
        taskType: 'FILE_SUMMARY_RESULT',
        taskId,
        userId,
        errorMessage: errorMsg,
        sentryEventId,
      }).catch(() => {});

      await withRetry(
        async () =>
          userFileRepo.updateById(fileId, userId, {
            summaryStatus: 'failed',
            summaryError: errorMsg,
          }),
        { label: 'FileSummaryResultHandler.updateFailed' }
      );
      return;
    }

    let summaryText = summary ?? '';
    if (summaryS3Key) {
      const downloaded = await withRetry(
        async () => storagePort.downloadJson<{ summary?: string; text?: string }>(summaryS3Key),
        { label: 'FileSummaryResultHandler.downloadJson' }
      );
      summaryText = downloaded.summary ?? downloaded.text ?? JSON.stringify(downloaded);
    }

    await withRetry(
      async () =>
        userFileRepo.updateById(fileId, userId, {
          summaryStatus: 'completed',
          summary: summaryText || undefined,
          summaryError: null,
        }),
      { label: 'FileSummaryResultHandler.updateCompleted' }
    );

    logger.info({ taskId, userId, fileId }, '파일 요약 DB 반영 완료');
  }
}
