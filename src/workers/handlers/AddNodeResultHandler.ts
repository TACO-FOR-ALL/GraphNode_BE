import { JobHandler } from './JobHandler';
import { Container } from '../../bootstrap/container';
import { AddNodeResultPayload } from '../../shared/dtos/queue';
import { AiAddNodeBatchResult } from '../../shared/dtos/ai_graph_output';
import { logger } from '../../shared/utils/logger';
import { withRetry } from '../../shared/utils/retry';
import { captureEvent, POSTHOG_EVENT } from '../../shared/utils/posthog';
import {
  normalizeAiOrigId,
  NormalizedAiOrigId,
  stripUserPrefix,
} from '../../shared/utils/aiNodeId';
import {
  BatchResolvedSourceTypeResult,
  ResolvedGraphSourceType,
  resolveSourceTypesByOrigIds,
} from '../utils/sourceTypeResolver';
import { GraphNodeDto } from '../../shared/dtos/graph';

interface NormalizedAddNodeItem {
  rawTempId: string;
  rawOrigId: string;
  normalizedOrigId: string;
  strippedSourcePrefix: boolean;
  clusterId: string;
  clusterName: string;
  numMessages?: number;
  numSections?: number;
  timestamp?: string | null;
}

/**
 * AddNode 결과 처리 핸들러
 *
 * 260411 작업 배경:
 * - AI payload의 `sourceType`에 의존하면 MongoDB에 `sourceType`이 비거나 잘못 저장되는 사례가 보고되었습니다.
 * - 또한 AddNode는 AI 배치 전용 string ID와 Mongo 영구 ID가 섞여 있어, 초보 개발자가 읽기 어려운 상태였습니다.
 *
 * 260411 작업 원칙:
 * 1. `origId`는 항상 `normalizeAiOrigId()`를 거쳐 정규화한다.
 * 2. `sourceType`은 AI payload가 아니라 실제 DB(conversation/note) 존재 여부로 판별한다.
 * 3. 배치용 string ID(`node.id`)와 Mongo 영구 ID(`graph_nodes.id`)를 분리해서 다룬다.
 */
export class AddNodeResultHandler implements JobHandler {
  async handle(message: AddNodeResultPayload, container: Container): Promise<void> {
    const { payload, taskId } = message;
    const { userId, status, resultS3Key, error } = payload;

    logger.info({ taskId, userId, status }, 'Handling AddNode result');

    // 의존성 주입
    const storagePort = container.getAwsS3Adapter();
    const graphService = container.getGraphEmbeddingService();
    const notiService = container.getNotificationService();
    const conversationService = container.getConversationService();
    const noteService = container.getNoteService();

    // AI 서버에서 실패한 경우
    if (status === 'FAILED' || error) {
      logger.error({ taskId, userId, error }, 'AddNode task failed from AI Server');

      const stats = await graphService.getStats(userId);
      if (stats) {
        stats.status = 'CREATED';
        await graphService.saveStats(stats);
      }

      await notiService.sendAddConversationFailed(userId, taskId, error || 'Unknown AI error');
      return;
    }

    // resultS3Key가 없으면 에러
    if (!resultS3Key) {
      throw new Error('No resultS3Key provided for ADD_NODE_RESULT');
    }

    try {
      // S3에서 결과 다운로드
      const batchResult = await withRetry(
        async () => storagePort.downloadJson<AiAddNodeBatchResult>(resultS3Key),
        { label: 'AddNodeResultHandler.downloadJson.batch' }
      );

      // 노드 정규화
      // 1. AI node들을 내부 처리용 정규화 구조로 바꾼다.
      const normalizedItems: NormalizedAddNodeItem[] = this.collectNormalizedNodeItems(batchResult);
      // 2. sourceType 판별에 사용할 normalized origId 목록만 추린다.
      const normalizedOrigIds: string[] = this.collectNormalizedOrigIds(normalizedItems);

      // sourceType resolve
      // 3. 실제 DB를 조회해 origId별 sourceType을 판별한다.
      const sourceTypeResult: BatchResolvedSourceTypeResult = await resolveSourceTypesByOrigIds(
        normalizedOrigIds,
        userId,
        {
          conversationService,
          noteService,
        }
      );

      // sourceType resolve 실패 시 에러
      if (sourceTypeResult.unresolvedOrigIds.length > 0) {
        logger.error(
          {
            taskId,
            userId,
            unresolvedOrigIds: sourceTypeResult.unresolvedOrigIds,
          },
          'Failed to resolve sourceType for add-node nodes from DB'
        );
        throw new Error(
          `Unable to resolve sourceType for add-node origIds: ${sourceTypeResult.unresolvedOrigIds.join(', ')}`
        );
      }

      // 기존 노드 조회
      // 4. 기존 Mongo 노드를 읽어 update / dedup 기준을 만든다.
      const existingNodes: GraphNodeDto[] = await graphService.listNodesAll(userId);

      // 5. normalized origId -> Mongo numeric id 맵을 만든다.
      const origIdToDbId: Map<string, number> = this.buildOrigIdToDbIdMap(existingNodes);

      // 6. 이번 배치에서 생성한 AI string id -> Mongo numeric id 맵을 만든다.
      const createdNodeIds: Map<string, number> = new Map();

      // 7. 신규 노드가 필요할 때 사용할 다음 numeric id를 계산한다.
      let nextNodeId = this.calculateNextNodeId(existingNodes);

      let totalNodesAdded = 0;
      let totalEdgesAdded = 0;
      let strippedOrigIdCount = 0;
      let unresolvedEdgeCount = 0;

      const clusterPromises: Promise<void>[] = [];
      const nodePromises: Promise<void>[] = [];

      /**
       * 260411 작업 설명:
       * - 이 블록은 AddNode payload의 각 node를 "정규화된 origId + DB에서 검증한 sourceType" 기준으로 저장합니다.
       * - 핵심은 `node.origId`를 그대로 쓰지 않는다는 점입니다.
       * - 반드시 `normalizeAiOrigId()`를 먼저 거쳐 실제 Mongo 원본 ID와 비교 가능한 값으로 바꾼 뒤,
       *   그 normalized origId로 `sourceTypesByOrigId`와 `origIdToDbId`를 조회합니다.
       *
       * Map 예시:
       * ```ts
       * const origIdToDbId = new Map<string, number>([
       *   ['conv-e2e-123', 11],
       *   ['note-e2e-123', 12],
       * ]);
       *
       * const sourceTypesByOrigId = new Map<string, 'chat' | 'markdown'>([
       *   ['conv-e2e-123', 'chat'],
       *   ['note-e2e-123', 'markdown'],
       * ]);
       * ```
       */
      for (const result of batchResult.results || []) {
        if (result.skipped && result.error) {
          logger.warn(
            {
              taskId,
              userId,
              conversationId: result.conversationId,
              noteId: result.noteId,
              error: result.error,
            },
            'AddNode result item skipped by AI pipeline - no nodes to persist'
          );
          continue;
        }

        // 클러스터 생성
        if (
          result.assignedCluster &&
          result.assignedCluster.isNewCluster &&
          result.assignedCluster.clusterId
        ) {
          clusterPromises.push(
            graphService.upsertCluster({
              id: result.assignedCluster.clusterId,
              userId,
              name: result.assignedCluster.name || '',
              description: result.assignedCluster.reasoning || '',
              themes: result.assignedCluster.themes || [],
              size: 1,
            })
          );
        }

        // 노드 처리
        for (const node of result.nodes || []) {
          // 노드 정규화
          // AI node.origId를 정규화된 내부 표현으로 다시 변환한다.
          const normalizedItem: NormalizedAddNodeItem = this.normalizeSingleNode(node);
          // 정규화된 origId로 실제 DB 기준 sourceType을 조회한다.
          const resolvedSourceType = sourceTypeResult.sourceTypesByOrigId.get(
            normalizedItem.normalizedOrigId
          );

          if (!resolvedSourceType) {
            throw new Error(
              `Missing resolved sourceType for add-node origId=${normalizedItem.normalizedOrigId}`
            );
          }

          if (normalizedItem.strippedSourcePrefix) {
            strippedOrigIdCount++;
          }

          // 기존 Mongo 노드가 있으면 같은 numeric id를 재사용한다.
          let dbNodeId = origIdToDbId.get(normalizedItem.normalizedOrigId);
          if (dbNodeId === undefined) {
            // 없으면 신규 numeric id를 발급한다.
            dbNodeId = nextNodeId;
            nextNodeId += 1;
            origIdToDbId.set(normalizedItem.normalizedOrigId, dbNodeId);
          }

          // 같은 배치의 edge가 raw AI string id를 참조할 수 있으므로 기록한다.
          createdNodeIds.set(normalizedItem.rawTempId, dbNodeId);

          nodePromises.push(
            graphService.upsertNode({
              id: dbNodeId,
              userId,
              origId: normalizedItem.normalizedOrigId,
              clusterId: normalizedItem.clusterId,
              clusterName: normalizedItem.clusterName || '',
              numMessages: this.resolveNumMessages(normalizedItem, resolvedSourceType),
              sourceType: resolvedSourceType,
              embedding: [],
              timestamp: normalizedItem.timestamp ?? null,
            })
          );
          totalNodesAdded += 1;
        }
      }

      await Promise.all([...clusterPromises, ...nodePromises]);

      // 260411: sourceType resolve 결과 로깅 추가
      logger.info(
        {
          taskId,
          userId,
          existingNodeCount: existingNodes.length,
          processedItems: batchResult.results?.length || 0,
          strippedOrigIdCount,
          resolvedChatCount: this.countResolvedSourceTypes(
            sourceTypeResult.sourceTypesByOrigId,
            'chat'
          ),
          resolvedMarkdownCount: this.countResolvedSourceTypes(
            sourceTypeResult.sourceTypesByOrigId,
            'markdown'
          ),
        },
        'AddNode normalized origIds and resolved source types before edge persistence'
      );

      /**
       * 260411 작업 설명:
       * - edge는 AI 배치 전용 string ID를 가리킬 수 있으므로, node 저장이 끝난 뒤 숫자형 Mongo ID로 해소해야 합니다.
       * - 해소 순서는 "이번 배치에서 생성한 노드 -> 기존 Mongo 노드 -> 숫자형 fallback"입니다.
       */
      const edgePromises: Promise<string>[] = [];
      for (const result of batchResult.results || []) {
        for (const edge of result.edges || []) {
          // edge.source를 Mongo numeric id로 해석한다.
          const sourceId = this.resolveNodeId(
            String(edge.source),
            userId,
            createdNodeIds,
            origIdToDbId
          );
          // edge.target도 같은 규칙으로 해석한다.
          const targetId = this.resolveNodeId(
            String(edge.target),
            userId,
            createdNodeIds,
            origIdToDbId
          );

          if (sourceId === null || targetId === null) {
            unresolvedEdgeCount += 1;
            logger.warn(
              { taskId, userId, source: edge.source, target: edge.target },
              'AddNode edge skipped: could not resolve node ID to DB numeric id'
            );
            continue;
          }

          edgePromises.push(
            graphService.upsertEdge({
              userId,
              source: sourceId,
              target: targetId,
              weight: edge.weight || 1.0,
              type: (edge.type || 'hard') as 'hard' | 'insight',
              intraCluster: edge.intraCluster ?? true,
            })
          );
          totalEdgesAdded += 1;
        }
      }

      await Promise.all(edgePromises);

      // 260411: sourceType resolve 결과 로깅 추가
      logger.info(
        {
          taskId,
          userId,
          totalNodesAdded,
          totalEdgesAdded,
          unresolvedEdgeCount,
        },
        'AddNode persistence finished with normalized node, edge, and sourceType resolution'
      );

      //
      // Stat 갱신
      const stats = await graphService.getStats(userId);
      if (stats) {
        stats.status = 'UPDATED';
        await graphService.saveStats(stats);
      }

      // macro_graph_updated PostHog 이벤트
      captureEvent(userId, POSTHOG_EVENT.MACRO_GRAPH_UPDATED, {
        nodes_added: totalNodesAdded,
        edges_added: totalEdgesAdded,
        processed_count: batchResult.processedCount || 0,
      });

      // 완료 알림
      await Promise.allSettled([
        notiService.sendAddConversationCompleted(userId, taskId, totalNodesAdded, totalEdgesAdded),
        notiService.sendFcmPushNotification(
          userId,
          'Graph Updated',
          'Your conversations are successfully added to your knowledge graph.',
          { taskId, status: 'COMPLETED' }
        ),
      ]);
    } catch (err) {
      logger.error({ err, taskId, userId }, 'Failed to process add node result');

      await notiService.sendAddConversationFailed(
        userId,
        taskId,
        err instanceof Error ? err.message : String(err)
      );
      await notiService.sendFcmPushNotification(
        userId,
        'Graph Update Failed',
        'There was a problem adding conversations to your graph.',
        { taskId, status: 'FAILED' }
      );
      throw err;
    }
  }

  /**
   * AddNode payload 전체를 순회하여, node별 정규화 정보를 미리 수집합니다.
   *
   * 목적:
   * - sourceType resolver에 넘길 origId 목록을 먼저 정규화된 기준으로 확보합니다.
   * - 초보 개발자가 "정규화 이전"과 "정규화 이후"를 코드상에서 한눈에 구분할 수 있게 합니다.
   * @param batchResult AddNode 결과 페이로드
   * @returns 정규화된 노드 아이템 목록
   */
  private collectNormalizedNodeItems(batchResult: AiAddNodeBatchResult): NormalizedAddNodeItem[] {
    const items: NormalizedAddNodeItem[] = [];

    //
    for (const result of batchResult.results || []) {
      for (const node of result.nodes || []) {
        items.push(this.normalizeSingleNode(node));
      }
    }

    return items;
  }

  /**
   * AI node 하나를 정규화된 내부 표현으로 변환합니다.
   *
   * 중요:
   * - 이 메서드가 `normalizeAiOrigId()`를 호출하는 최초 지점입니다.
   * - 이후 resolver, dedup, 저장은 모두 이 결과의 `normalizedOrigId`를 사용합니다.
   * @param node AI 노드
   * @returns 정규화된 노드 아이템
   */
  private normalizeSingleNode(node: {
    id: string;
    origId: string;
    clusterId: string;
    clusterName: string;
    numMessages?: number;
    numSections?: number;
    timestamp?: string | null;
  }): NormalizedAddNodeItem {
    const normalizedOrigId: NormalizedAiOrigId = normalizeAiOrigId(node.origId);

    return {
      rawTempId: String(node.id),
      rawOrigId: node.origId,
      normalizedOrigId: normalizedOrigId.normalizedOrigId,
      strippedSourcePrefix: normalizedOrigId.strippedSourcePrefix,
      clusterId: node.clusterId,
      clusterName: node.clusterName || '',
      numMessages: node.numMessages,
      numSections: node.numSections,
      timestamp: node.timestamp ?? null,
    };
  }

  /**
   * 정규화된 노드 아이템 목록에서 정규화된 origId 목록을 수집합니다.
   * @param items 정규화된 노드 아이템 목록
   * @returns 정규화된 origId 목록
   */
  private collectNormalizedOrigIds(items: NormalizedAddNodeItem[]): string[] {
    const normalizedOrigIds: string[] = [];

    for (const item of items) {
      normalizedOrigIds.push(item.normalizedOrigId);
    }

    return normalizedOrigIds;
  }

  /**
   * 기존 노드 목록을 기반으로 origId -> DB numeric id 맵을 빌드합니다.
   * @param existingNodes 기존 노드 목록
   * @returns origId -> DB numeric id 맵
   */
  private buildOrigIdToDbIdMap(
    existingNodes: Array<{ origId: string; id: number }>
  ): Map<string, number> {
    const origIdToDbId = new Map<string, number>();

    for (const node of existingNodes) {
      const normalizedOrigId = normalizeAiOrigId(node.origId).normalizedOrigId;
      origIdToDbId.set(normalizedOrigId, node.id);
    }

    return origIdToDbId;
  }

  /**
   * 기존 노드 목록을 기반으로 다음 노드 ID를 계산합니다.
   * @param existingNodes 기존 노드 목록
   * @returns 다음 노드 ID
   */
  private calculateNextNodeId(existingNodes: Array<{ id: number }>): number {
    if (existingNodes.length === 0) {
      return 1;
    }

    let maxNodeId = existingNodes[0].id;
    for (const node of existingNodes) {
      if (node.id > maxNodeId) {
        maxNodeId = node.id;
      }
    }

    return maxNodeId + 1;
  }

  /**
   * sourceType에 따라 numMessages를 resolve합니다.
   * @param node 정규화된 노드 아이템
   * @param sourceType sourceType
   * @returns numMessages
   */
  private resolveNumMessages(
    node: NormalizedAddNodeItem,
    sourceType: ResolvedGraphSourceType
  ): number {
    if (sourceType === 'markdown') {
      return node.numSections ?? 0;
    }
    return node.numMessages ?? 0;
  }

  /**
   * sourceType별로 resolve된 노드 개수를 셉니다.
   * @param sourceTypesByOrigId sourceType별로 resolve된 노드 개수
   * @param expectedType 기대하는 sourceType
   * @returns sourceType별로 resolve된 노드 개수
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
   * rawId를 DB numeric id로 resolve합니다.
   * @param rawId rawId
   * @param userId userId
   * @param createdNodeIds 생성된 노드 ID 맵
   * @param origIdToDbId origId -> DB numeric id 맵
   * @returns DB numeric id
   */
  private resolveNodeId(
    rawId: string,
    userId: string,
    createdNodeIds: Map<string, number>,
    origIdToDbId: Map<string, number>
  ): number | null {
    const fromBatch = createdNodeIds.get(rawId);
    if (fromBatch !== undefined) {
      return fromBatch;
    }

    const origIdWithoutUserPrefix = stripUserPrefix(rawId, userId);
    const normalizedOrigId = normalizeAiOrigId(origIdWithoutUserPrefix).normalizedOrigId;
    const fromExisting = origIdToDbId.get(normalizedOrigId);
    if (fromExisting !== undefined) {
      return fromExisting;
    }

    const parsed = parseInt(rawId, 10);
    if (isNaN(parsed)) {
      return null;
    }
    return parsed;
  }
}
