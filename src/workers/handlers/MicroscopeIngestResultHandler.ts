import * as Sentry from '@sentry/node';

import { JobHandler } from './JobHandler';
import type { Container } from '../../bootstrap/container';
import { MicroscopeIngestFromNodeResultQueuePayload } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { NotificationType } from '../notificationType';
import { AiMicroscopeIngestResultItem } from '../../shared/dtos/ai_graph_output';
import { MicroscopeWorkspaceMetaDoc } from '../../core/types/persistence/microscope_workspace.persistence';
import { withRetry } from '../../shared/utils/retry';
import { captureEvent, POSTHOG_EVENT } from '../../shared/utils/posthog';
import { notifyWorkerFailed } from '../../shared/utils/discord';
import { parseUserIdFromMicroscopeNodeTaskId } from '../../shared/utils/microscopeTaskId';
import { ValidationError } from '../../shared/errors/domain';
import { buildMicroscopeVisualizationFromIngestResult } from '../../shared/utils/microscopeIngestResult';

/**
 * Microscope 문서 분석(Ingest) 결과 처리 핸들러
 *
 * Flow:
 * 1. AI 서버 워커가 문서 분석(그래프 생성)을 마치고 SQS로 반환한 결과를 수신
 * 2. MicroscopeManagementService를 통해 해당 문서의 진행 상태 갱신 (MongoDB)
 * 3. 개별 파일 처리 완료(성공/실패) 알림을 사용자에게 발송
 * 4. 대상 워크스페이스 내 모든 문서 처리가 완료되었는지 확인하고 합산 통계(개수)와 함께 "전체 종료" 알림 발송
 */
export class MicroscopeIngestResultHandler implements JobHandler {
  async handle(
    message: MicroscopeIngestFromNodeResultQueuePayload,
    container: Container
  ): Promise<void> {
    const { payload, taskId } = message;
    const { user_id, group_id, status, source_id, chunks_count, error } = payload;

    const payloadRecord = payload as Record<string, unknown>;
    // AI Python 워커가 보내는 snake_case / camelCase 혼용 및 taskId 내 userId 폴백
    const userId =
      user_id ??
      (typeof payloadRecord.userId === 'string' ? payloadRecord.userId : undefined) ??
      parseUserIdFromMicroscopeNodeTaskId(taskId);
    if (!userId) {
      throw new ValidationError('user_id is required in microscope ingest result payload');
    }

    // taskId 접미사 파싱: _block / _nonblock 구분
    const isBlockMode = taskId.endsWith('_block');
    const isNonBlockMode = taskId.endsWith('_nonblock');
    const isDualMode = isBlockMode || isNonBlockMode;
    const baseDocId = isBlockMode
      ? taskId.slice(0, -'_block'.length)
      : isNonBlockMode
        ? taskId.slice(0, -'_nonblock'.length)
        : taskId;

    const sourceId = source_id;
    const visualization = buildMicroscopeVisualizationFromIngestResult(
      payloadRecord as Record<string, unknown>
    );
    const standardizedS3Key = visualization?.standardizedS3Key ?? visualization?.visualizationS3Key;
    const blockGraphS3Key = visualization?.blockGraphS3Key;

    const microscopeService = container.getMicroscopeManagementService();

    const groupIdFromPayload =
      group_id ??
      (typeof payloadRecord.workspace_id === 'string' ? payloadRecord.workspace_id : undefined) ??
      (typeof payloadRecord.workspaceId === 'string' ? payloadRecord.workspaceId : undefined);

    // base docId로 워크스페이스 조회 (접미사 없는 원본 id)
    const groupId = await microscopeService.resolveGroupIdForIngestResult(
      userId,
      baseDocId,
      groupIdFromPayload
    );

    logger.info({ taskId, baseDocId, userId, groupId, status, isBlockMode, isNonBlockMode }, 'Handling Microscope ingest result');
    const notiService = container.getNotificationService();
    const storagePort = container.getAwsS3Adapter();
    const creditService = container.getCreditService();

    try {
      let downloadedGraphData: any = undefined;
      let downloadedBlockGraphData: Record<string, unknown> | undefined;

      if (status === 'COMPLETED') {
        if (isBlockMode) {
          // block 결과: block_graph.json 다운로드
          // Fallback: AI 워커가 block_graph_s3_key 대신 standardized_s3_key 필드에 블록 경로를 담아 보낼 수 있음
          const effectiveBlockGraphS3Key = blockGraphS3Key ?? standardizedS3Key;
          if (!blockGraphS3Key && standardizedS3Key) {
            logger.warn(
              { taskId, fallbackKey: standardizedS3Key },
              'block mode: block_graph_s3_key absent — falling back to standardized_s3_key for block graph download'
            );
          }
          if (effectiveBlockGraphS3Key) {
            try {
              downloadedBlockGraphData = await withRetry(
                async () =>
                  await storagePort.downloadJson<Record<string, unknown>>(effectiveBlockGraphS3Key, {
                    bucketType: 'payload',
                  }),
                { label: 'MicroscopeIngestResultHandler.downloadJson.blockGraph' }
              );
              logger.info({ taskId, effectiveBlockGraphS3Key }, 'Downloaded block_graph JSON from S3');
            } catch (downloadErr) {
              logger.error(
                { err: downloadErr, taskId, effectiveBlockGraphS3Key },
                'Failed to download block_graph JSON from S3'
              );
            }
          }
        } else if (isNonBlockMode) {
          // nonblock 결과: standardized.json 다운로드
          // Fallback: AI 워커가 standardized_s3_key 대신 block_graph_s3_key 필드에 경로를 담을 수 있음
          const effectiveNonBlockS3Key = standardizedS3Key ?? blockGraphS3Key;
          if (!standardizedS3Key && blockGraphS3Key) {
            logger.warn(
              { taskId, fallbackKey: blockGraphS3Key },
              'nonblock mode: standardized_s3_key absent — falling back to block_graph_s3_key for graph download'
            );
          }
          if (effectiveNonBlockS3Key) {
            try {
              downloadedGraphData = await withRetry(
                async () =>
                  await storagePort.downloadJson<AiMicroscopeIngestResultItem[]>(effectiveNonBlockS3Key, {
                    bucketType: 'payload',
                  }),
                { label: 'MicroscopeIngestResultHandler.downloadJson.graph' }
              );
              logger.info({ taskId, effectiveNonBlockS3Key }, 'Downloaded standardized graph JSON from S3');
            } catch (downloadErr) {
              logger.error(
                { err: downloadErr, taskId, effectiveNonBlockS3Key },
                'Failed to download graph JSON from S3'
              );
            }
          }
        } else {
          // 레거시 태스크 (_block/_nonblock 접미사 없음): 기존 동작 완전 유지
          if (standardizedS3Key) {
            try {
              downloadedGraphData = await withRetry(
                async () =>
                  await storagePort.downloadJson<AiMicroscopeIngestResultItem[]>(standardizedS3Key, {
                    bucketType: 'payload',
                  }),
                { label: 'MicroscopeIngestResultHandler.downloadJson.graph' }
              );
              logger.info({ taskId, standardizedS3Key }, 'Downloaded standardized graph JSON from S3');
            } catch (downloadErr) {
              logger.error({ err: downloadErr, taskId, standardizedS3Key }, 'Failed to download graph JSON from S3');
            }
          }
        }
      }

      // 서비스 호출: block/nonBlock 별 분기
      let updatedWorkspace: MicroscopeWorkspaceMetaDoc;

      if (isBlockMode) {
        updatedWorkspace = await microscopeService.updateBlockViewDocumentStatus(
          userId,
          groupId,
          baseDocId,
          status,
          downloadedBlockGraphData,
          error,
          visualization
        );
      } else {
        updatedWorkspace = await microscopeService.updateDocumentStatus(
          userId,
          groupId,
          baseDocId,
          status,
          sourceId,
          downloadedGraphData,
          error,
          visualization,
          isDualMode
        );
      }

      // S3 Key 값은 Workspace에서 찾아서 알림용으로 활용합니다.
      const targetDoc = updatedWorkspace.documents.find((d) => d.id === baseDocId);
      const s3Key = targetDoc?.s3Key || 'unknown_s3_key';

      // 2. 단일 파일 처리 완료(혹은 실패) Noti 발송
      if (status === 'FAILED') {
        const errorMsg = error || 'Unknown error from Microscope AI Pipeline';
        logger.warn(
          { taskId, userId, groupId, s3Key, error: errorMsg },
          'Microscope document processing failed'
        );

        Sentry.addBreadcrumb({
          type: 'error',
          category: 'worker.ai_failed',
          message: `MICROSCOPE_INGEST_RESULT: AI 서버 FAILED 응답 수신`,
          data: { taskId, userId, groupId, errorMsg },
          level: 'warning',
        });

        const sentryEventId = Sentry.withScope((scope) => {
          scope.setLevel('warning');
          scope.setTag('task_type', 'MICROSCOPE_INGEST_FROM_NODE_RESULT');
          scope.setTag('failure_source', 'ai_server');
          scope.setTag('correlation_id', taskId);
          scope.setContext('worker_failure', { taskId, userId, groupId, errorMsg });
          return Sentry.captureMessage(
            `[Worker FAILED] MICROSCOPE_INGEST_FROM_NODE_RESULT: ${errorMsg}`,
            'warning'
          );
        });

        void notifyWorkerFailed({
          taskType: 'MICROSCOPE_INGEST_FROM_NODE_RESULT',
          taskId,
          userId,
          errorMessage: errorMsg,
          sentryEventId,
        }).catch(() => {});

        await notiService.sendMicroscopeDocumentFailed(userId, taskId, errorMsg);

        // 4-1. 선제적 차감된 크레딧 롤백 (Rollback)
        try {
          await creditService.rollbackByTaskId(taskId);
        } catch (creditErr) {
          logger.error(
            { err: creditErr, taskId, userId },
            'Credit rollback failed after microscope ingest failure'
          );
        }
      } else {
        logger.info(
          { taskId, userId, groupId, s3Key, chunks_count },
          'Microscope document processing completed successfully'
        );

        let totalNodes = 0;
        let totalEdges = 0;
        if (downloadedGraphData && Array.isArray(downloadedGraphData)) {
          downloadedGraphData.forEach((chunk: any) => {
            totalNodes += chunk.nodes?.length || 0;
            totalEdges += chunk.edges?.length || 0;
          });
        }

        captureEvent(userId, POSTHOG_EVENT.MICROSCOPE_INGEST_COMPLETED, {
          chunks_count: chunks_count || 0,
          nodes_count: totalNodes,
          edges_count: totalEdges,
          group_id: groupId,
          source_id: sourceId,
        });

        await notiService.sendMicroscopeDocumentCompleted(userId, taskId, sourceId, chunks_count);

        // 4-2. 선제적 차감된 크레딧 커밋 (Commit)
        try {
          await creditService.commitByTaskId(taskId);
        } catch (creditErr) {
          logger.error(
            { err: creditErr, taskId, userId },
            'Credit commit failed after microscope ingest success'
          );
        }
      }

      // 3. 워크스페이스 내 모든 문서 전체 status 기반 완료 여부 확인
      // 듀얼 SQS 모드: doc.status = COMPLETED 는 block + nonBlock 양쪽 완료 시만 설정됨
      const totalDocs = updatedWorkspace.documents.length;
      let completedCount = 0;
      let failedCount = 0;
      let pendingCount = 0;

      for (const doc of updatedWorkspace.documents) {
        if (doc.status === 'COMPLETED') completedCount++;
        else if (doc.status === 'FAILED') failedCount++;
        else pendingCount++;
      }

      // 대기 중인 문서가 하나도 없다면, 모든 작업이 완료된 것임
      if (pendingCount === 0) {
        logger.info(
          { userId, groupId, totalDocs, completedCount, failedCount },
          'All documents in Microscope workspace have been processed'
        );

        await Promise.allSettled([
          notiService.sendMicroscopeWorkspaceCompleted(userId, taskId),
          // FCM 푸시 알림 (전체 완료 건)
          notiService.sendFcmPushNotification(
            userId,
            'Microscope Workspace Ready',
            `Your workspace "${updatedWorkspace.name}" is ready! (${completedCount} passed, ${failedCount} failed)`,
            {
              type: NotificationType.MICROSCOPE_WORKSPACE_COMPLETED,
              groupId,
              completedCount: String(completedCount),
            }
          ),
        ]);
      }
    } catch (err) {
      logger.error(
        { err, taskId, baseDocId, userId, groupId },
        'Exception during Microscope Result Handling'
      );
      // 핸들링 도중 발생한 에러 기록 시 SQS 큐가 재전송(nack)하도록 throw 유지 결정 가능
      // 여기서는 메시지 소모를 방해하지 않도록 처리합니다. (단일 업데이트 실패이므로 Retry 고려)
      throw err;
    }
  }
}
