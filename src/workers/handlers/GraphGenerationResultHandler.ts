import { Readable } from 'stream';
import { ulid } from 'ulid';

import { JobHandler } from './JobHandler';
import type { Container } from '../../bootstrap/container';
import { GraphGenResultPayload } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { mapAiOutputToSnapshot } from '../../shared/mappers/ai_graph_output.mapper';
import { GraphSnapshotDto, PersistGraphPayloadDto } from '../../shared/dtos/graph';
import { AiGraphOutputDto, GraphSummary } from '../../shared/dtos/ai_graph_output';
import { GraphFeaturesJsonDto } from '../../core/types/vector/graph-features';
import { GraphSummaryDoc } from '../../core/types/persistence/graph.persistence';
import { NotificationType } from '../notificationType';
import { withRetry } from '../../shared/utils/retry';
import { captureEvent } from '../../shared/utils/posthog';
import { normalizeAiOrigId, NormalizedAiOrigId } from '../../shared/utils/aiNodeId';

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
        return;
      }

      // COMPLETED 처리
      if (status === 'COMPLETED' && resultS3Key) {
        // 1. S3에서 결과 JSON, Features, Summary 병렬 다운로드
        const downloadPromises: Promise<any>[] = [
          withRetry(async () => await storagePort.downloadJson<AiGraphOutputDto>(resultS3Key), {
            label: 'GraphGenerationResultHandler.downloadJson.graph',
          }),
          payload.featuresS3Key
            ? withRetry(
                async () =>
                  await storagePort.downloadJson<GraphFeaturesJsonDto>(payload.featuresS3Key!),
                { label: 'GraphGenerationResultHandler.downloadJson.features' }
              ).catch((err) => {
                logger.error(
                  { err, taskId, userId },
                  'Failed to download features JSON (Non-fatal)'
                );
                return null;
              })
            : Promise.resolve(null),
          payload.summaryIncluded && payload.summaryS3Key
            ? withRetry(
                async () => await storagePort.downloadJson<GraphSummary>(payload.summaryS3Key!),
                { label: 'GraphGenerationResultHandler.downloadJson.summary' }
              ).catch((err) => {
                logger.error(
                  { err, taskId, userId },
                  'Failed to download summary JSON (Non-fatal)'
                );
                return null;
              })
            : Promise.resolve(null),
        ];

        const [aiGraphOutput, featuresJson, summaryJson] = (await Promise.all(
          downloadPromises
        )) as [AiGraphOutputDto, GraphFeaturesJsonDto | null, GraphSummary | null];

        // 2. Mapper를 통해 DTO 변환
        /**
         * GraphGeneration 결과에서 식별자를 분리해 처리하는 이유와 배경
         *
         * 2026-04-11 기준 재조사에서 확인된 문제 상황:
         * - AI 매크로 파이프라인은 여러 source input(chat, markdown)을 합칠 때
         *   `src0_`, `src1_` 같은 임시 namespace를 붙일 수 있습니다.
         * - 그러나 MongoDB `graph_nodes.origId`는 실제 conversation/note 원본 ID와
         *   직접 대응되어야 하며, 테스트와 AddNode 업데이트 경로도 이를 전제로 합니다.
         * - 따라서 graph generation 결과를 저장할 때는 AI 내부 namespace와
         *   영구 저장용 origId를 명확히 구분해야 합니다.
         *
         * 이 시점에 공존하는 ID 종류:
         * - `node.id`
         *   AI 그래프 내부 숫자 ID입니다. edge, subcluster가 이 값을 참조하므로 변경하면 안 됩니다.
         *   예: `7`
         * - `node.orig_id`
         *   원본 source 문서를 가리키는 ID입니다. Mongo `graph_nodes.origId`에 저장될 후보입니다.
         *   예: `conv-e2e-123`
         *   예: `note-e2e-123`
         *   예: `src0_conv-e2e-123`
         *   예: `src1_note-e2e-123`
         * - vector item id
         *   BE가 Vector DB 저장 시 만드는 식별자입니다.
         *   예: `${userId}_conv-e2e-123`
         *
         * 왜 `orig_id`만 정규화하는가:
         * - `node.id`는 edge/subcluster 연결 무결성을 위해 보존해야 합니다.
         * - `orig_id`는 저장, dedup, 테스트, 운영 로그에서 모두 사람이 이해하는 원본 ID여야 합니다.
         * - features JSON의 `orig_id`까지 같은 규칙으로 정규화하지 않으면
         *   snapshot과 vector metadata의 key가 서로 달라질 수 있습니다.
         *
         * 이 블록에서 만드는 Map 구조 예시:
         * ```ts
         * const nodeMap = new Map<string, AiGraphNodeOutput>([
         *   [
         *     'conv-e2e-123',
         *     {
         *       id: 7,
         *       orig_id: 'conv-e2e-123',
         *       cluster_id: 'cluster_1',
         *       cluster_name: 'Graph Learning',
         *       keywords: [],
         *       top_keywords: ['gnn'],
         *       timestamp: null,
         *       num_sections: 2,
         *       source_type: 'chat',
         *     },
         *   ],
         *   [
         *     'note-e2e-123',
         *     {
         *       id: 8,
         *       orig_id: 'note-e2e-123',
         *       cluster_id: 'cluster_1',
         *       cluster_name: 'Graph Learning',
         *       keywords: [],
         *       top_keywords: ['knowledge-graph'],
         *       timestamp: null,
         *       num_sections: 1,
         *       source_type: 'markdown',
         *     },
         *   ],
         * ]);
         * ```
         *
         * 내부 처리 흐름:
         * 1. AI graph JSON의 각 `node.orig_id`를 정규화합니다.
         * 2. AI features JSON의 각 `conv.orig_id`도 같은 규칙으로 정규화합니다.
         * 3. 정규화된 graph JSON으로 snapshot을 생성합니다.
         * 4. 정규화된 `orig_id`를 key로 `nodeMap`을 구성합니다.
         * 5. vector metadata도 동일한 normalized origId를 사용하게 맞춥니다.
         * 6. raw/normalized 샘플을 로그에 남겨, 추후 runtime 로그와 DB 상태를 대조할 수 있게 합니다.
         */
        let strippedOrigIdCount = 0;
        const normalizedAiGraphOutput: AiGraphOutputDto = {
          ...aiGraphOutput,
          nodes: aiGraphOutput.nodes.map((node) => {
            const normalized: NormalizedAiOrigId = normalizeAiOrigId(node.orig_id);
            if (normalized.strippedSourcePrefix) strippedOrigIdCount++;

            return {
              ...node,
              orig_id: normalized.normalizedOrigId,
            };
          }),
        };
        const normalizedFeaturesJson = featuresJson
          ? {
              ...featuresJson,
              conversations: featuresJson.conversations.map((conv) => ({
                ...conv,
                orig_id: normalizeAiOrigId(conv.orig_id).normalizedOrigId,
              })),
            }
          : null;

        logger.info(
          {
            taskId,
            userId,
            nodeCount: aiGraphOutput.nodes.length,
            strippedOrigIdCount,
            sampleNodeIds: aiGraphOutput.nodes.slice(0, 3).map((node) => ({
              graphNodeId: node.id,
              rawOrigId: node.orig_id,
              normalizedOrigId: normalizeAiOrigId(node.orig_id).normalizedOrigId,
            })),
          },
          'Normalized AI graph-generation node identifiers before persistence'
        );

        const snapshot: GraphSnapshotDto = mapAiOutputToSnapshot(normalizedAiGraphOutput, userId);
        const persistPayload: PersistGraphPayloadDto = {
          userId,
          snapshot,
        };

        // 3. 병렬 DB 저장 작업 준비
        const saveTasks: Promise<any>[] = [];

        // 3.1. 메인 그래프 DB 저장 (필수 작업, throw 전파됨)
        saveTasks.push(graphService.persistSnapshot(persistPayload));

        // 3.2. Vector DB 저장 (옵션 작업, 실패 시 메인 동작에 영향 없는 Non-fatal)
        if (normalizedFeaturesJson) {
          saveTasks.push(
            (async () => {
              try {
                const graphVectorService = container.getGraphVectorService();

                // Mapping: orig_id -> Node Info
                const nodeMap = new Map<string, (typeof normalizedAiGraphOutput.nodes)[0]>();
                normalizedAiGraphOutput.nodes.forEach((node) => {
                  if (node.orig_id) nodeMap.set(node.orig_id, node);
                });

                const vectorItems = normalizedFeaturesJson.conversations.map((conv, idx) => {
                  const vector = normalizedFeaturesJson.embeddings[idx];
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
                logger.error(
                  { err: featureErr, taskId, userId },
                  'Failed to persist graph features (Non-fatal)'
                );
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
                logger.error(
                  { err: sumErr, taskId, userId },
                  'Failed to persist integrated graph summary (Non-fatal)'
                );
              }
            })()
          );
        }

        // 3.4. 모든 DB 데이터 저장 병렬 대기
        await Promise.all(saveTasks);

        // 3.4.1. PostHog 이벤트 수집 (Macro Graph 생성 완료 가치 측정)
        captureEvent(userId, 'macro_graph_generated', {
          nodes_count: aiGraphOutput.nodes.length,
          edges_count: aiGraphOutput.edges.length,
          subclusters_count: aiGraphOutput.subclusters?.length || 0,
          clusters_count: aiGraphOutput.metadata.clusters?.length || 0,
          summary_themes: summaryJson?.overview?.primary_interests || [],
        });

        // 3.5. 상태 변경: CREATED (updatedAt은 repository가 자동으로 설정합니다)
        const stats = await graphService.getStats(userId);
        if (stats) {
          stats.status = 'CREATED';
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
          ),
        ]);
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
        logger.error(
          { err: fallbackErr, taskId, userId },
          'Failed to send fallback error notification'
        );
      }

      // 여기서 에러를 던지면 sqs-consumer가 메시지를 삭제하지 않고 재시도 처리함 (설정에 따라 DLQ 이동)
      // Sentry 로깅 등을 연동할 수 있도록 상위로 전파
      throw err;
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
