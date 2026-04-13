import { Readable } from 'stream';
import { ulid } from 'ulid';

import { JobHandler } from './JobHandler';
import type { Container } from '../../bootstrap/container';
import { GraphGenResultPayload } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { mapAiOutputToSnapshot } from '../../shared/mappers/ai_graph_output.mapper';
import { PersistGraphPayloadDto } from '../../shared/dtos/graph';
import { AiGraphOutputDto, GraphSummary } from '../../shared/dtos/ai_graph_output';
import { GraphFeaturesJsonDto } from '../../core/types/vector/graph-features';
import { GraphSummaryDoc } from '../../core/types/persistence/graph.persistence';
import { NotificationType } from '../notificationType';
import { withRetry } from '../../shared/utils/retry';
import { getPostHogClient } from '../../shared/utils/posthog';
import { redis } from '../../infra/redis/client';

/**
 * 그래프 생성 결과 처리 핸들러
 *
 * Flow:
 * 1. AI가 생성한 결과 JSON을 S3에서 다운로드
 * 2. 내부 그래프 스냅샷 포맷으로 변환 (Mapper 재사용)
 * 3. GraphEmbeddingService를 통해 DB 저장 (Service 재사용)
 * 4. NotificationService를 통해 사용자에게 알림 발행 (Service 재사용)
 */
export class GraphGenerationResultHandler implements JobHandler {
  private static readonly GRAPH_GEN_FINISHED_TTL_SECONDS = 60 * 60 * 24; // 24시간

  async handle(message: GraphGenResultPayload, container: Container): Promise<void> {
    const { payload, taskId } = message; // Payload & taskId 추출(AI server도 동일한 queue 구조 사용 필요)
    const { userId, status, resultS3Key, error } = payload; // Payload 에서 상세 데이터 추출

    logger.info({ taskId, userId, status }, 'Handling graph generation result');

    // 의존성 획득 (Reusing existing services/ports)
    const storagePort = container.getAwsS3Adapter(); // S3
    const graphService = container.getGraphEmbeddingService(); // DB Persistence
    const notiService = container.getNotificationService(); // Redis Pub/Sub

    try {
      // 상태에 따른 처리, FAILED 시에
      if (status === 'FAILED') {
        const errorMsg = error || 'Unknown error from AI server';
        logger.warn({ taskId, userId, error: errorMsg }, 'Graph generation failed');

        // 실패 알림 전송 전에 상태 롤백
        const stats = await graphService.getStats(userId);
        if (stats) {
          stats.status = 'NOT_CREATED';
          await graphService.saveStats(stats);
        }

        // 실패 알림 전송(Redis Pub/Sub & FCM)
        await notiService.sendGraphGenerationFailed(userId, taskId, errorMsg);
        await notiService.sendFcmPushNotification(
          userId,
          'Graph Generation Failed',
          'Failed to generate knowledge graph. Please try again.',
          { type: NotificationType.GRAPH_GENERATION_FAILED, taskId, error: errorMsg }
        );

        await this.trackGraphGenerationResult({
          taskId,
          userId,
          status: 'FAILED',
          errorMessage: errorMsg,
          finishedAt: new Date().toISOString(),
        });
        return;
      }

      // COMPLETED 처리
      if (status === 'COMPLETED' && resultS3Key) {
        // 1. S3에서 결과 JSON, Features, Summary 병렬 다운로드
        const downloadPromises: Promise<any>[] = [
          withRetry(
            async () => await storagePort.downloadJson<AiGraphOutputDto>(resultS3Key),
            { label: 'GraphGenerationResultHandler.downloadJson.graph' }
          ),
          payload.featuresS3Key
            ? withRetry(
                async () => await storagePort.downloadJson<GraphFeaturesJsonDto>(payload.featuresS3Key!),
                { label: 'GraphGenerationResultHandler.downloadJson.features' }
              ).catch((err) => {
                logger.error({ err, taskId, userId }, 'Failed to download features JSON (Non-fatal)');
                return null;
              })
            : Promise.resolve(null),
          (payload.summaryIncluded && payload.summaryS3Key)
            ? withRetry(
                async () => await storagePort.downloadJson<GraphSummary>(payload.summaryS3Key!),
                { label: 'GraphGenerationResultHandler.downloadJson.summary' }
              ).catch((err) => {
                logger.error({ err, taskId, userId }, 'Failed to download summary JSON (Non-fatal)');
                return null;
              })
            : Promise.resolve(null),
        ];

        const [aiGraphOutput, featuresJson, summaryJson] = await Promise.all(downloadPromises) as [AiGraphOutputDto, GraphFeaturesJsonDto | null, GraphSummary | null];

        // 2. Mapper를 통해 DTO 변환
        const snapshot = mapAiOutputToSnapshot(aiGraphOutput, userId);
        const persistPayload: PersistGraphPayloadDto = {
          userId,
          snapshot,
        };

        // 3. 병렬 DB 저장 작업 준비
        const saveTasks: Promise<any>[] = [];

        // 3.1. 메인 그래프 DB 저장 (필수 작업, throw 전파됨)
        saveTasks.push(graphService.persistSnapshot(persistPayload));

        // 3.2. Vector DB 저장 (옵션 작업, 실패 시 메인 동작에 영향 없는 Non-fatal)
        if (featuresJson) {
          saveTasks.push(
            (async () => {
              try {
                const graphVectorService = container.getGraphVectorService();

                // Mapping: orig_id -> Node Info
                const nodeMap = new Map<string, typeof aiGraphOutput.nodes[0]>();
                aiGraphOutput.nodes.forEach((node) => {
                  if (node.orig_id) nodeMap.set(node.orig_id, node);
                });

                const vectorItems = featuresJson.conversations.map((conv, idx) => {
                  const vector = featuresJson.embeddings[idx];
                  const nodeInfo = nodeMap.get(conv.orig_id);

                  const clusterId = nodeInfo?.cluster_id || 'unknown';
                  const clusterName = nodeInfo?.cluster_name || 'Unclustered';
                  const keywordsStr = conv.keywords.map((k) => k.term).join(',');

                  const metadata: any = {
                    user_id: userId,
                    conversation_id: conv.orig_id,
                    orig_id: conv.orig_id,
                    node_id: conv.id,
                    cluster_id: clusterId,
                    cluster_name: clusterName,
                    keywords: keywordsStr,
                    create_time: conv.create_time || 0,
                    num_messages: conv.num_sections || 0,
                    source_type: conv.source_type || 'chat',
                    update_time: conv.update_time || 0,
                  };

                  return {
                    id: `${userId}_${conv.orig_id}`,
                    vector: vector,
                    payload: metadata,
                  };
                });

                await withRetry(
                  async () => await graphVectorService.saveGraphFeatures(userId, vectorItems),
                  { label: 'GraphVectorService.saveGraphFeatures' }
                );
              } catch (featureErr) {
                logger.error({ err: featureErr, taskId, userId }, 'Failed to persist graph features (Non-fatal)');
              }
            })()
          );
        }

        // 3.3. Summary DB 저장 (옵션 작업, 실패 시 메인 동작에 영향 없는 Non-fatal)
        if (summaryJson) {
          saveTasks.push(
            (async () => {
              try {
                logger.info({ taskId, userId }, 'Processing integrated graph summary from result');
                const summaryDoc: GraphSummaryDoc = {
                  id: ulid(),
                  userId: userId,
                  overview: summaryJson.overview,
                  clusters: summaryJson.clusters,
                  patterns: summaryJson.patterns,
                  connections: summaryJson.connections,
                  recommendations: summaryJson.recommendations,
                  detail_level: summaryJson.detail_level,
                  generatedAt: summaryJson.generated_at || new Date().toISOString(),
                };

                await graphService.upsertGraphSummary(userId, summaryDoc);
                logger.info({ taskId, userId }, 'Integrated graph summary persisted to DB');
              } catch (sumErr) {
                logger.error({ err: sumErr, taskId, userId }, 'Failed to persist integrated graph summary (Non-fatal)');
              }
            })()
          );
        }

        // 3.4. 모든 DB 데이터 저장 병렬 대기
        await Promise.all(saveTasks);

        // 3.5. 상태 변경: CREATED (모두 완전하게 저장된 후 마지막에 상태 업데이트)
        const stats = await graphService.getStats(userId);
        if (stats) {
          stats.status = 'CREATED';
          stats.updatedAt = new Date().toISOString();
          await graphService.saveStats(stats);
          logger.info({ taskId, userId }, 'Graph status updated to CREATED');
        }

        // 4. 완료 알림 병렬 전송
        await Promise.allSettled([
          notiService.sendGraphGenerationCompleted(userId, taskId),
          notiService.sendFcmPushNotification(
            userId,
            'Graph Ready',
            `Your knowledge graph (${snapshot.nodes.length} nodes) is ready!`,
            { type: NotificationType.GRAPH_GENERATION_COMPLETED, taskId }
          )
        ]);

        await this.trackGraphGenerationResult({
          taskId,
          userId,
          status: 'COMPLETED',
          finishedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      // 에러 발생 시 상태 롤백 및 알림 전송
      const errorMsg = err instanceof Error ? err.message : 'Processing failed internally';
      logger.error({ err, taskId, userId }, 'Error processing graph generation result');
      
      try {
        const stats = await graphService.getStats(userId);
        if (stats) {
          stats.status = 'NOT_CREATED';
          await graphService.saveStats(stats);
        }

        // 실패 알림 전송 (에러 발생 시점)
        await notiService.sendGraphGenerationFailed(userId, taskId, errorMsg);
        await notiService.sendFcmPushNotification(
          userId,
          'Graph Generation Failed',
          'Failed to generate knowledge graph. Please try again.',
          { type: NotificationType.GRAPH_GENERATION_FAILED, taskId, error: errorMsg }
        );
      } catch (fallbackErr) {
        logger.error({ err: fallbackErr, taskId, userId }, 'Failed to send fallback error notification');
      }

      // 내부 처리 실패도 분석상 실패 케이스로 남겨 추후 원인 분석 가능하도록 기록
      await this.trackGraphGenerationResult({
        taskId,
        userId,
        status: 'FAILED',
        errorMessage: errorMsg,
        finishedAt: new Date().toISOString(),
      });

      // 여기서 에러를 던지면 sqs-consumer가 메시지를 삭제하지 않고 재시도 처리함 (설정에 따라 DLQ 이동)
      // Sentry 로깅 등을 연동할 수 있도록 상위로 전파
      throw err;
    }
  }

  /**
   * Macro Graph 완료 이벤트(B/C/D)를 PostHog로 전송한다.
   *
   * - A: macro_graph_generatio요청은  GraphGenerationService.requestGraphGenerationViaQueue 에서 전송송
   * - B: macro_graph_generation_succeeded
   * - C: macro_graph_generation_failed
   * - D: macro_graph_generation_finished (통합 완료 이벤트)
   */
  private async trackGraphGenerationResult(params: {
    taskId: string;
    userId: string;
    status: 'COMPLETED' | 'FAILED';
    finishedAt: string;
    errorMessage?: string;
  }): Promise<void> {
    const { taskId, userId, status, finishedAt, errorMessage } = params;

    // 재시도 처리 시 동일 taskId에 대한 완료 이벤트 중복 발행을 방지한다.
    try {
      const dedupeResult = await redis.set(
        `macro_graph:finished:${taskId}`,
        '1',
        'EX',
        GraphGenerationResultHandler.GRAPH_GEN_FINISHED_TTL_SECONDS,
        'NX'
      );
      if (dedupeResult !== 'OK') {
        return;
      }
    } catch (err) {
      // 중복 방지 실패 시에도 분석 이벤트 자체는 최대한 전송 시도
      logger.warn({ err, userId, taskId }, 'Failed to set macro graph finished dedupe key');
    }

    let requestedAt: string | null = null;
    try {
      requestedAt = await redis.get(`macro_graph:start:${taskId}`);
    } catch (err) {
      logger.warn({ err, userId, taskId }, 'Failed to load macro graph start time');
    }

    const finishedAtMs = new Date(finishedAt).getTime();
    const requestedAtMs = requestedAt ? new Date(requestedAt).getTime() : NaN;
    const durationMs =
      Number.isFinite(requestedAtMs) && finishedAtMs >= requestedAtMs
        ? finishedAtMs - requestedAtMs
        : null;

    const commonProperties = {
      source: 'macro_graph',
      task_id: taskId,
      user_id: userId,
      status,
      requested_at: requestedAt,
      finished_at: finishedAt,
      duration_ms: durationMs,
      ...(errorMessage ? { error_message: errorMessage } : {}),
    };

    try {
      const posthog = getPostHogClient();
      if (!posthog) return;

      if (status === 'COMPLETED') {
        posthog.capture({
          distinctId: userId,
          event: 'macro_graph_generation_succeeded',
          properties: commonProperties,
        });
      } else {
        posthog.capture({
          distinctId: userId,
          event: 'macro_graph_generation_failed',
          properties: commonProperties,
        });
      }

      posthog.capture({
        distinctId: userId,
        event: 'macro_graph_generation_finished',
        properties: commonProperties,
      });
    } catch (err) {
      logger.error({ err, userId, taskId, status }, 'Failed to capture macro graph result events');
    }
  }

  /**
   * Readable Stream을 문자열로 변환하는 헬퍼
   */
  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }
}
