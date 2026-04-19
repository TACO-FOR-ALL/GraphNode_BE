import { JobHandler } from './JobHandler';
import type { Container } from '../../bootstrap/container';
import type { GraphProgressPayload, QueueMessage } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';

/**
 * 그래프 생성 **진행 중** SQS 메시지를 처리합니다.
 *
 * - taskType: `GRAPH_GENERATION_PROGRESS`
 * - 최종 완료는 `GRAPH_GENERATION_RESULT`로만 처리되며, 여기서는 DB 반영 없이 알림만 발행합니다.
 * - AI가 넣은 `timestamp`를 알림에 그대로 실어 FE가 수신 순서와 무관하게 최신 진행만 표시할 수 있게 합니다.
 */
export class GraphGenerationProgressHandler implements JobHandler {
  async handle(message: QueueMessage, container: Container): Promise<void> {
    const envelope = message as GraphProgressPayload;
    const { taskId, timestamp: envelopeTimestamp, payload } = envelope;
    const { userId, currentStage, progressPercent, etaSeconds } = payload;

    if (!taskId || !userId || !currentStage?.trim()) {
      logger.warn(
        { taskId, userId, currentStage },
        '그래프 진행 메시지 스킵: taskId / userId / currentStage 가 비어 있습니다.'
      );
      return;
    }

    if (!envelopeTimestamp?.trim()) {
      logger.warn({ taskId, userId }, '그래프 진행 메시지 스킵: envelope timestamp 가 없습니다.');
      return;
    }

    if (!Number.isFinite(progressPercent)) {
      logger.warn(
        { taskId, userId, currentStage, progressPercent },
        '그래프 진행 메시지 스킵: progressPercent 가 유효한 숫자가 아닙니다.'
      );
      return;
    }

    const normalizedProgress = Math.max(0, Math.min(100, Math.floor(progressPercent)));
    const normalizedEta = this.normalizeEtaSeconds(etaSeconds);

    const notificationService = container.getNotificationService();
    await notificationService.sendGraphGenerationProgressUpdated({
      userId,
      taskId,
      sourceTimestamp: envelopeTimestamp,
      currentStage: currentStage.trim(),
      progressPercent: normalizedProgress,
      etaSeconds: normalizedEta,
    });

    logger.info(
      {
        taskId,
        userId,
        currentStage: currentStage.trim(),
        progressPercent: normalizedProgress,
        etaSeconds: normalizedEta,
      },
      '그래프 생성 진행률 알림 발행 완료'
    );
  }

  /**
   * etaSeconds: AI가 null을 보내거나 일부 단계에서 생략할 수 있음.
   * 숫자일 때만 양의 정수로 맞추고, 그 외는 null.
   */
  private normalizeEtaSeconds(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    return null;
  }
}
