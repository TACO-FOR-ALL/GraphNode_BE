import * as Sentry from '@sentry/node';

import { JobHandler } from './JobHandler';
import type { Container } from '../../bootstrap/container';
import { MicroscopeIngestFromNodeResultQueuePayload } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { NotificationType } from '../notificationType';
import { MicroscopeWorkspaceMetaDoc } from '../../core/types/persistence/microscope_workspace.persistence';
import { loadEnv } from '../../config/env';
import { withRetry } from '../../shared/utils/retry';
import {
  isPersistableMicroscopeBundle,
  parseMicroscopeS3Payload,
} from '../../shared/utils/parseMicroscopeS3Payload';
import { captureEvent, POSTHOG_EVENT } from '../../shared/utils/posthog';
import { notifyWorkerFailed } from '../../shared/utils/discord';
import { parseUserIdFromMicroscopeNodeTaskId } from '../../shared/utils/microscopeTaskId';
import { ValidationError } from '../../shared/errors/domain';

/**
 * Microscope 문서 분석(Ingest) 결과 처리 핸들러
 *
 * Flow:
 * 1. AI 서버 워커가 문서 분석을 마치고 SQS 결과 + S3 ingest_bundle 을 반환
 * 2. (COMPLETED 시) S3 ingest_bundle 다운로드 → Neo4j persist (MICROSCOPE_NEO4J_WRITE_ON_BE)
 * 3. MicroscopeManagementService 로 문서 진행 상태 갱신 및 Mongo graph payload 저장
 * 4. 개별 파일 처리 완료(성공/실패) 알림 발송
 * 5. 워크스페이스 내 모든 문서 완료 시 종합 알림 발송
 *
 * Neo4j 쓰기 정책: AI는 read+Chroma만, graph topology 쓰기는 이 핸들러에서만 수행합니다.
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

    const sourceId = source_id;
    const standardizedS3Key = payload.standardized_s3_key;

    // Envelope의 taskId를 통해 문서 ID 식별
    const docId = taskId;

    // 의존성 획득
    const microscopeService = container.getMicroscopeManagementService();

    const groupIdFromPayload =
      group_id ??
      (typeof payloadRecord.workspace_id === 'string' ? payloadRecord.workspace_id : undefined) ??
      (typeof payloadRecord.workspaceId === 'string' ? payloadRecord.workspaceId : undefined);

    const groupId = await microscopeService.resolveGroupIdForIngestResult(
      userId,
      docId,
      groupIdFromPayload
    );

    logger.info({ taskId, userId, groupId, status }, 'Handling Microscope ingest result');
    const notiService = container.getNotificationService();
    const storagePort = container.getAwsS3Adapter();
    const creditService = container.getCreditService();

    try {
      let downloadedGraphData: ReturnType<typeof parseMicroscopeS3Payload>['graphItems'] | undefined;
      let ingestBundle: ReturnType<typeof parseMicroscopeS3Payload>['bundle'] = null;

      // 1. S3에서 ingest_bundle 또는 레거시 standardized JSON 다운로드
      if (status === 'COMPLETED' && standardizedS3Key) {
        try {
          const s3Payload = await withRetry(
            async () =>
              await storagePort.downloadJson<unknown>(standardizedS3Key, {
                bucketType: 'payload',
              }),
            { label: 'MicroscopeIngestResultHandler.downloadJson.graph' }
          );
          const parsed = parseMicroscopeS3Payload(s3Payload);
          ingestBundle = parsed.bundle;
          downloadedGraphData = parsed.graphItems;
          logger.info(
            { taskId, standardizedS3Key, hasBundle: Boolean(ingestBundle) },
            'Successfully downloaded microscope ingest JSON from S3'
          );
        } catch (downloadErr) {
          logger.error(
            { err: downloadErr, taskId, standardizedS3Key },
            'Failed to download graph JSON from S3'
          );
          throw downloadErr;
        }
      }

      // 2. Neo4j persist (BE write — AI는 read + Chroma만)
      const env = loadEnv();
      if (
        status === 'COMPLETED' &&
        env.MICROSCOPE_NEO4J_WRITE_ON_BE &&
        isPersistableMicroscopeBundle(ingestBundle)
      ) {
        const neo4jPersistence = container.getMicroscopeNeo4jPersistenceService();
        await withRetry(
          async () => await neo4jPersistence.persistIngestBundle(ingestBundle),
          { label: 'MicroscopeIngestResultHandler.persistNeo4j' }
        );
      }

      // 3. 서비스 호출을 통한 개별 문서 진행상태 갱신 및 Mongo 페이로드 저장
      const updatedWorkspace: MicroscopeWorkspaceMetaDoc =
        await microscopeService.updateDocumentStatus(
          userId,
          groupId,
          docId,
          status,
          sourceId,
          downloadedGraphData,
          error
        );

      // S3 Key 값은 Workspace에서 찾아서 알림용으로 활용합니다.
      const targetDoc = updatedWorkspace.documents.find((d) => d.id === docId);
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

      // 3. 워크스페이스 내에 남은 PENDING/PROCESSING 문서가 있는지 검사하여 최종 종합 Noti 판별
      const totalDocs = updatedWorkspace.documents.length;
      let completedCount = 0;
      let failedCount = 0;
      let pendingCount = 0;

      for (const doc of updatedWorkspace.documents) {
        if (doc.status === 'COMPLETED') completedCount++;
        else if (doc.status === 'FAILED') failedCount++;
        else pendingCount++;
      }

      // 대기 중인 문서가 하나도 없다면, 모든 작업이 완료된 것임!
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
        { err, taskId, userId, groupId, docId },
        'Exception during Microscope Result Handling'
      );
      // 핸들링 도중 발생한 에러 기록 시 SQS 큐가 재전송(nack)하도록 throw 유지 결정 가능
      // 여기서는 메시지 소모를 방해하지 않도록 처리합니다. (단일 업데이트 실패이므로 Retry 고려)
      throw err;
    }
  }
}
