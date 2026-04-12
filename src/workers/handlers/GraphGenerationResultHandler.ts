import { Readable } from 'stream';
import { ulid } from 'ulid';

import { JobHandler } from './JobHandler';
import type { Container } from '../../bootstrap/container';
import { GraphGenResultPayload } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { mapAiOutputToSnapshot } from '../../shared/mappers/ai_graph_output.mapper';
import { GraphSnapshotDto, PersistGraphPayloadDto } from '../../shared/dtos/graph';
import {
  AiGraphNodeOutput,
  AiGraphOutputDto,
  GraphSummary,
} from '../../shared/dtos/ai_graph_output';
import { GraphFeaturesJsonDto } from '../../core/types/vector/graph-features';
import { GraphSummaryDoc } from '../../core/types/persistence/graph.persistence';
import { NotificationType } from '../notificationType';
import { withRetry } from '../../shared/utils/retry';
import { captureEvent } from '../../shared/utils/posthog';
import { normalizeAiOrigId } from '../../shared/utils/aiNodeId';
import {
  BatchResolvedSourceTypeResult,
  ResolvedGraphSourceType,
  resolveSourceTypesByOrigIds,
} from '../utils/sourceTypeResolver';
import { countSourceTypesFromSnapshot } from '../utils/countSourceTypes';

interface NormalizedGraphOutputResult {
  normalizedAiGraphOutput: AiGraphOutputDto;
  strippedOrigIdCount: number;
}

/**
 * 그래프 생성 결과 처리 핸들러
 *
 * 260411 작업 배경:
 * - AI가 반환한 `source_type`이 비어 있거나 Mongo 저장 결과에 반영되지 않는 사례가 확인되었습니다.
 * - AI 코드는 수정할 수 없으므로, BE가 `origId` 기반으로 실제 DB(conversation/note)를 조회해
 *   sourceType을 재판별하도록 바꿨습니다.
 *
 * 260411 작업 원칙:
 * 1. `orig_id`는 먼저 정규화한다.
 * 2. `source_type`은 AI 값을 신뢰하지 않고 실제 DB 기준으로 보정한다.
 * 3. snapshot과 vector metadata가 동일한 normalized origId / sourceType을 사용하도록 맞춘다.
 */
export class GraphGenerationResultHandler implements JobHandler {
  async handle(message: GraphGenResultPayload, container: Container): Promise<void> {
    const { payload, taskId } = message;
    const { userId, status, resultS3Key, error } = payload;

    logger.info({ taskId, userId, status }, 'Handling graph generation result');

    // 의존성 가져오기
    const storagePort = container.getAwsS3Adapter();
    const graphService = container.getGraphEmbeddingService();
    const notiService = container.getNotificationService();
    const conversationService = container.getConversationService();
    const noteService = container.getNoteService();

    try {
      // 그래프 생성 실패 처리
      if (status === 'FAILED') {
        const errorMsg = error || 'Unknown error from AI server';
        logger.warn({ taskId, userId, error: errorMsg }, 'Graph generation failed');

        const stats = await graphService.getStats(userId);
        if (stats) {
          stats.status = 'NOT_CREATED';
          await graphService.saveStats(stats);
        }

        // 실패 알림 전송
        await notiService.sendGraphGenerationFailed(userId, taskId, errorMsg);
        await notiService.sendFcmPushNotification(
          userId,
          'Graph Generation Failed',
          'Failed to generate knowledge graph. Please try again.',
          { type: NotificationType.GRAPH_GENERATION_FAILED, taskId, error: errorMsg }
        );
        return;
      }

      // AI 요청 성공 시
      if (status === 'COMPLETED' && resultS3Key) {
        // 1. AI 그래프 데이터 다운로드
        const downloadPromises: Promise<any>[] = [
          withRetry(async () => storagePort.downloadJson<AiGraphOutputDto>(resultS3Key), {
            label: 'GraphGenerationResultHandler.downloadJson.graph',
          }),
          payload.featuresS3Key
            ? withRetry(
                async () => storagePort.downloadJson<GraphFeaturesJsonDto>(payload.featuresS3Key!),
                { label: 'GraphGenerationResultHandler.downloadJson.features' }
              ).catch((err) => {
                logger.error(
                  { err, taskId, userId },
                  'Failed to download features JSON (Non-fatal)'
                );
                return null;
              })
            : Promise.resolve(null),

          // 2. 그래프 요약 데이터 다운로드
          payload.summaryIncluded && payload.summaryS3Key
            ? withRetry(async () => storagePort.downloadJson<GraphSummary>(payload.summaryS3Key!), {
                label: 'GraphGenerationResultHandler.downloadJson.summary',
              }).catch((err) => {
                logger.error(
                  { err, taskId, userId },
                  'Failed to download summary JSON (Non-fatal)'
                );
                return null;
              })
            : Promise.resolve(null),
        ];

        // 3. 다운로드된 데이터 처리
        const [aiGraphOutput, featuresJson, summaryJson] = (await Promise.all(
          downloadPromises
        )) as [AiGraphOutputDto, GraphFeaturesJsonDto | null, GraphSummary | null];

        /**
         * 260411 작업 설명:
         * - 이 블록은 AI graph JSON을 Mongo 저장 직전에 "정규화된 origId + 실제 DB 기준 sourceType" 상태로 바꾸는 단계입니다.
         * - `node.id`는 AI 내부 그래프 연결용 숫자 ID라서 보존해야 하고,
         *   `node.orig_id`만 정규화 및 sourceType 보정 대상입니다.
         *
         * Map 예시:
         * ```ts
         * const sourceTypesByOrigId = new Map<string, 'chat' | 'markdown'>([
         *   ['conv-e2e-123', 'chat'],
         *   ['note-e2e-123', 'markdown'],
         * ]);
         * ```
         */
        // 1. AI graph JSON의 orig_id를 먼저 정규화한다.
        const normalizedGraphOutputResult: NormalizedGraphOutputResult =
          this.normalizeGraphOutput(aiGraphOutput);

        // 2. 정규화된 origId 목록으로 실제 DB sourceType을 판별한다.
        const sourceTypeResult: BatchResolvedSourceTypeResult = await resolveSourceTypesByOrigIds(
          this.collectGraphOrigIds(normalizedGraphOutputResult.normalizedAiGraphOutput),
          userId,
          { conversationService, noteService }
        );

        // 3. sourceType을 끝내 판별하지 못한 origId가 있으면 저장하지 않는다.
        this.throwIfSourceTypeUnresolved(taskId, userId, sourceTypeResult.unresolvedOrigIds);

        // 4. graph JSON의 각 node에 DB 기준 sourceType을 덮어쓴다.
        const sourceTypeResolvedGraphOutput: AiGraphOutputDto =
          this.applyResolvedSourceTypesToGraphOutput(
            normalizedGraphOutputResult.normalizedAiGraphOutput,
            sourceTypeResult.sourceTypesByOrigId
          );
        // 5. features JSON에도 같은 normalized origId / sourceType을 반영한다.
        const normalizedFeaturesJson = this.normalizeFeaturesJson(
          featuresJson,
          sourceTypeResult.sourceTypesByOrigId
        );

        // 6. 나중에 로그와 DB를 대조할 수 있도록 샘플 상태를 남긴다.
        this.logResolvedGraphSourceTypes(
          taskId,
          userId,
          aiGraphOutput,
          normalizedGraphOutputResult.strippedOrigIdCount,
          sourceTypeResult
        );

        // 7. sourceType까지 보정된 graph output을 최종 snapshot DTO로 변환한다.
        const snapshot: GraphSnapshotDto = mapAiOutputToSnapshot(
          sourceTypeResolvedGraphOutput,
          userId
        );
        const persistPayload: PersistGraphPayloadDto = {
          userId,
          snapshot,
        };

        const saveTasks: Promise<any>[] = [];
        saveTasks.push(graphService.persistSnapshot(persistPayload));

        // 8. features JSON이 있으면 vector metadata도 같은 normalized origId / sourceType 기준으로 맞춘다.
        if (normalizedFeaturesJson) {
          saveTasks.push(
            (async () => {
              try {
                // 8. vector metadata도 같은 normalized origId / sourceType 기준으로 맞춘다.
                const graphVectorService = container.getGraphVectorService();
                const nodeMap = this.buildNodeMap(sourceTypeResolvedGraphOutput.nodes);
                const vectorItems = this.buildVectorItems(userId, normalizedFeaturesJson, nodeMap);

                await withRetry(
                  async () => graphVectorService.saveGraphFeatures(userId, vectorItems),
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

        // 9. summary JSON이 있으면 graph summary도 저장한다.
        if (summaryJson) {
          saveTasks.push(
            (async () => {
              try {
                logger.info({ taskId, userId }, 'Processing integrated graph summary from result');

                // GraphSnapshotDto에서, sourceType이 chat, note, notion인 것의 개수를 각각 골라낸다.
                // 2026_04_12 기준, 임시로 for문 루프 돌려서 메서드로 만들어둠. 나중에 최적화 필요,
                // FIXME TODO

                const { chatCount, noteCount, notionCount } =
                  countSourceTypesFromSnapshot(snapshot);

                // Chat Cnt, Note Cnt, Notion Cnt 계산 된 값으로 덮어쓰기
                summaryJson.overview.total_conversations = chatCount;
                summaryJson.overview.total_notes = noteCount;
                summaryJson.overview.total_notions = notionCount;

                // GraphSummaryDoc 생성
                const summaryDoc: GraphSummaryDoc = {
                  id: ulid(),
                  userId,
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

        await Promise.all(saveTasks);

        // 10. macro_graph_generated 이벤트를 발생시킨다.
        captureEvent(userId, 'macro_graph_generated', {
          nodes_count: aiGraphOutput.nodes.length,
          edges_count: aiGraphOutput.edges.length,
          subclusters_count: aiGraphOutput.subclusters?.length || 0,
          clusters_count: aiGraphOutput.metadata.clusters?.length || 0,
          summary_themes: summaryJson?.overview?.primary_interests || [],
        });

        // 11. graph status를 CREATED로 업데이트한다.
        const stats = await graphService.getStats(userId);
        if (stats) {
          stats.status = 'CREATED';
          await graphService.saveStats(stats);
          logger.info({ taskId, userId }, 'Graph status updated to CREATED');
        }

        // 12. graph generation completed 이벤트를 발생시킨다.
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
      const errorMsg = err instanceof Error ? err.message : 'Processing failed internally';
      logger.error({ err, taskId, userId }, 'Error processing graph generation result');

      try {
        const stats = await graphService.getStats(userId);
        if (stats) {
          stats.status = 'NOT_CREATED';
          await graphService.saveStats(stats);
        }

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

      throw err;
    }
  }

  /**
   * AI graph output에서 orig_id를 정규화합니다.
   * @param aiGraphOutput AI graph output
   * @returns 정규화된 AI graph output
   */
  private normalizeGraphOutput(aiGraphOutput: AiGraphOutputDto): NormalizedGraphOutputResult {
    let strippedOrigIdCount = 0;
    const normalizedNodes: AiGraphNodeOutput[] = [];

    // 1. AI graph JSON의 orig_id를 먼저 정규화한다.
    for (const node of aiGraphOutput.nodes) {
      const normalizedOrigId = normalizeAiOrigId(node.orig_id);
      if (normalizedOrigId.strippedSourcePrefix) {
        strippedOrigIdCount += 1;
      }

      normalizedNodes.push({
        ...node,
        orig_id: normalizedOrigId.normalizedOrigId,
      });
    }

    // 2. 정규화된 AI graph output 반환
    return {
      normalizedAiGraphOutput: {
        ...aiGraphOutput,
        nodes: normalizedNodes,
      },
      strippedOrigIdCount,
    };
  }

  /**
   * AI graph output에서 orig_id를 수집합니다.
   * @param aiGraphOutput AI graph output
   * @returns orig_id 배열
   */
  private collectGraphOrigIds(aiGraphOutput: AiGraphOutputDto): string[] {
    const origIds: string[] = [];

    for (const node of aiGraphOutput.nodes) {
      origIds.push(node.orig_id);
    }

    return origIds;
  }

  /**
   * sourceType이 해결되지 않은 경우 에러를 발생시킵니다.
   * @param taskId 태스크 ID
   * @param userId 사용자 ID
   * @param unresolvedOrigIds 해결되지 않은 orig_id 배열
   */
  private throwIfSourceTypeUnresolved(
    taskId: string,
    userId: string,
    unresolvedOrigIds: string[]
  ): void {
    if (unresolvedOrigIds.length === 0) {
      return;
    }

    logger.error(
      {
        taskId,
        userId,
        unresolvedOrigIds,
      },
      'Failed to resolve sourceType for graph-generation nodes from DB'
    );

    throw new Error(
      `Unable to resolve sourceType for graph-generation origIds: ${unresolvedOrigIds.join(', ')}`
    );
  }

  /**
   * sourceType이 해결된 AI graph output을 반환합니다.
   * @param aiGraphOutput AI graph output
   * @param sourceTypesByOrigId orig_id별 sourceType 맵
   * @returns sourceType이 해결된 AI graph output
   */
  private applyResolvedSourceTypesToGraphOutput(
    aiGraphOutput: AiGraphOutputDto,
    sourceTypesByOrigId: Map<string, ResolvedGraphSourceType>
  ): AiGraphOutputDto {
    const resolvedNodes: AiGraphNodeOutput[] = [];

    for (const node of aiGraphOutput.nodes) {
      const resolvedSourceType = sourceTypesByOrigId.get(node.orig_id) ?? node.source_type;
      resolvedNodes.push({
        ...node,
        source_type: resolvedSourceType,
      });
    }

    return {
      ...aiGraphOutput,
      nodes: resolvedNodes,
    };
  }

  /**
   * sourceType이 해결된 features json을 반환합니다.
   * @param featuresJson features json
   * @param sourceTypesByOrigId orig_id별 sourceType 맵
   * @returns sourceType이 해결된 features json
   */
  private normalizeFeaturesJson(
    featuresJson: GraphFeaturesJsonDto | null,
    sourceTypesByOrigId: Map<string, ResolvedGraphSourceType>
  ): GraphFeaturesJsonDto | null {
    if (!featuresJson) {
      return null;
    }

    //
    const normalizedConversations: GraphFeaturesJsonDto['conversations'] = [];

    // 2. features json의 각 conversation에 DB 기준 sourceType을 덮어쓴다.
    for (const conversation of featuresJson.conversations) {
      const normalizedOrigId = normalizeAiOrigId(conversation.orig_id).normalizedOrigId;
      const resolvedSourceType =
        sourceTypesByOrigId.get(normalizedOrigId) ?? conversation.source_type;

      normalizedConversations.push({
        ...conversation,
        orig_id: normalizedOrigId,
        source_type: resolvedSourceType,
      });
    }

    return {
      ...featuresJson,
      conversations: normalizedConversations,
    };
  }

  /**
   * sourceType이 해결된 AI graph output의 로그를 기록합니다.
   * @param taskId 태스크 ID
   * @param userId 사용자 ID
   * @param rawAiGraphOutput 원본 AI graph output
   * @param strippedOrigIdCount 정규화된 orig_id 개수
   * @param sourceTypeResult sourceType 해결 결과
   */
  private logResolvedGraphSourceTypes(
    taskId: string,
    userId: string,
    rawAiGraphOutput: AiGraphOutputDto,
    strippedOrigIdCount: number,
    sourceTypeResult: BatchResolvedSourceTypeResult
  ): void {
    const sampleNodeIds: Array<{
      graphNodeId: number;
      rawOrigId: string;
      normalizedOrigId: string;
      resolvedSourceType: ResolvedGraphSourceType | undefined;
    }> = [];

    const sampleCount = Math.min(rawAiGraphOutput.nodes.length, 3);
    for (let index = 0; index < sampleCount; index += 1) {
      const node = rawAiGraphOutput.nodes[index];
      const normalizedOrigId = normalizeAiOrigId(node.orig_id).normalizedOrigId;

      sampleNodeIds.push({
        graphNodeId: node.id,
        rawOrigId: node.orig_id,
        normalizedOrigId,
        resolvedSourceType: sourceTypeResult.sourceTypesByOrigId.get(normalizedOrigId),
      });
    }

    logger.info(
      {
        taskId,
        userId,
        nodeCount: rawAiGraphOutput.nodes.length,
        strippedOrigIdCount,
        resolvedChatCount: this.countResolvedSourceTypes(
          sourceTypeResult.sourceTypesByOrigId,
          'chat'
        ),
        resolvedMarkdownCount: this.countResolvedSourceTypes(
          sourceTypeResult.sourceTypesByOrigId,
          'markdown'
        ),
        sampleNodeIds,
      },
      'Normalized AI graph-generation node identifiers and resolved source types before persistence'
    );
  }

  /**
   * sourceType이 해결된 AI graph output의 로그를 기록합니다.
   * @param sourceTypesByOrigId orig_id별 sourceType 맵
   * @param expectedType 기대하는 sourceType
   * @returns 기대하는 sourceType의 개수
   */
  private countResolvedSourceTypes(
    sourceTypesByOrigId: Map<string, ResolvedGraphSourceType>,
    expectedType: ResolvedGraphSourceType
  ): number {
    let count = 0;

    for (const sourceType of sourceTypesByOrigId.values()) {
      if (sourceType === expectedType) {
        count += 1;
      }
    }

    return count;
  }

  /**
   * orig_id별 노드 맵을 생성합니다.
   * @param nodes 노드 배열
   * @returns orig_id별 노드 맵
   */
  private buildNodeMap(nodes: AiGraphNodeOutput[]): Map<string, AiGraphNodeOutput> {
    const nodeMap = new Map<string, AiGraphNodeOutput>();

    for (const node of nodes) {
      if (node.orig_id) {
        nodeMap.set(node.orig_id, node);
      }
    }

    return nodeMap;
  }

  private buildVectorItems(
    userId: string,
    featuresJson: GraphFeaturesJsonDto,
    nodeMap: Map<string, AiGraphNodeOutput>
  ): Array<{ id: string; vector: number[]; payload: any }> {
    const vectorItems: Array<{ id: string; vector: number[]; payload: any }> = [];

    for (let index = 0; index < featuresJson.conversations.length; index += 1) {
      const conversation = featuresJson.conversations[index];
      const vector = featuresJson.embeddings[index];
      const nodeInfo = nodeMap.get(conversation.orig_id);

      const clusterId = nodeInfo?.cluster_id || 'unknown';
      const clusterName = nodeInfo?.cluster_name || 'Unclustered';
      const keywordsStr = this.joinKeywords(conversation.keywords);

      const metadata: any = {
        user_id: userId,
        conversation_id: conversation.orig_id,
        orig_id: conversation.orig_id,
        node_id: conversation.id,
        cluster_id: clusterId,
        cluster_name: clusterName,
        keywords: keywordsStr,
        create_time: conversation.create_time || 0,
        num_messages: conversation.num_sections || 0,
        source_type: conversation.source_type || 'chat',
        update_time: conversation.update_time || 0,
      };

      vectorItems.push({
        id: `${userId}_${conversation.orig_id}`,
        vector,
        payload: metadata,
      });
    }

    return vectorItems;
  }

  private joinKeywords(keywords: Array<{ term: string; score: number }>): string {
    const terms: string[] = [];

    for (const keyword of keywords) {
      terms.push(keyword.term);
    }

    return terms.join(',');
  }

  /**
   * Readable Stream을 문자열로 변환하는 헬퍼입니다.
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
