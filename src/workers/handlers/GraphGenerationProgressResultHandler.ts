import { JobHandler } from './JobHandler';
import type { Container } from '../../bootstrap/container';
import type { GraphProgressPayload, QueueMessage } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';

/**
 * 그래프 생성 진행률 결과 처리 핸들러
 *
 * 책임:
 * - AI가 보낸 진행률 payload를 검증합니다.
 * - 검증된 진행률 이벤트를 NotificationService로 전달합니다.
 */
export class GraphGenerationProgressResultHandler implements JobHandler {
  async handle(message: QueueMessage, container: Container): Promise<void> {
    const progressMessage = message as GraphProgressPayload;
    const { taskId, payload } = progressMessage;
    const { userId, completedStage, progressPercent } = payload;

    if (!taskId || !userId || !completedStage) {
      logger.warn(
        { taskId, userId, completedStage },
        'Skip graph progress message: required fields are missing'
      );
      return;
    }

    if (!Number.isFinite(progressPercent)) {
      logger.warn(
        { taskId, userId, completedStage, progressPercent },
        'Skip graph progress message: progressPercent must be a finite number'
      );
      return;
    }

    // 잘못된 입력으로 인한 UI 오동작을 막기 위해 0~100으로 보정합니다.
    const normalizedProgress = Math.max(0, Math.min(100, Math.floor(progressPercent)));

    const notificationService = container.getNotificationService();
    await notificationService.sendGraphGenerationProgressUpdated(
      userId,
      taskId,
      completedStage,
      normalizedProgress
    );

    logger.info(
      { taskId, userId, completedStage, progressPercent: normalizedProgress },
      'Graph generation progress notification published'
    );
  }
}
