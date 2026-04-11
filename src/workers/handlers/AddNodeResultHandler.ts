import { JobHandler } from './JobHandler';
import { Container } from '../../bootstrap/container';
import { AddNodeResultPayload } from '../../shared/dtos/queue';
import { AiAddNodeBatchResult, isNoteResultItem } from '../../shared/dtos/ai_graph_output';
import { logger } from '../../shared/utils/logger';
import { withRetry } from '../../shared/utils/retry';
import { captureEvent } from '../../shared/utils/posthog';
import {
  normalizeAiOrigId,
  NormalizedAiOrigId,
  stripUserPrefix,
} from '../../shared/utils/aiNodeId';

/**
 * AddNode (배치) 결과 처리 핸들러
 *
 * Flow:
 * 1. AI Server 완료 메세지 (ADD_NODE_RESULT) 수신
 * 2. 결과 JSON (resultS3Key) S3에서 다운로드
 * 3. 결과(노드, 엣지, 클러스터 등)를 DB에 반영
 * 4. GraphStats 업데이트
 * 5. 알림 전송
 */
export class AddNodeResultHandler implements JobHandler {
  async handle(message: AddNodeResultPayload, container: Container): Promise<void> {
    const { payload, taskId } = message;
    const { userId, status, resultS3Key, error } = payload;

    logger.info({ taskId, userId, status }, 'Handling AddNode result');

    // 의존성 획득
    const storagePort = container.getAwsS3Adapter();
    const graphService = container.getGraphEmbeddingService();
    const notiService = container.getNotificationService();

    // 상태에 따른 처리, FAILED 시에
    if (status === 'FAILED' || error) {
      logger.error({ taskId, userId, error }, 'AddNode task failed from AI Server');

      // 실패 알림 전송 전에 상태 롤백
      const stats = await graphService.getStats(userId);
      if (stats) {
        stats.status = 'CREATED';
        await graphService.saveStats(stats);
      }

      await notiService.sendAddConversationFailed(userId, taskId, error || 'Unknown AI error');
      return;
    }

    if (!resultS3Key) {
      throw new Error('No resultS3Key provided for ADD_NODE_RESULT');
    }

    try {
      // 1. S3에서 결과 다운로드
      const batchResult = await withRetry(
        async () => await storagePort.downloadJson<AiAddNodeBatchResult>(resultS3Key),
        { label: 'AddNodeResultHandler.downloadJson.batch' }
      );

      // 2. DB 저장 (클러스터 생성, 노드 및 엣지 반영)
      const existingNodes = await graphService.listNodesAll(userId); // 기존 노드들 조회
      let nextNodeId =
        existingNodes.length > 0 ? Math.max(...existingNodes.map((n) => n.id)) + 1 : 1;

      // AI가 반환하는 엣지 target은 ChromaDB record ID 포맷인 "{userId}_{origId}"입니다.
      // 기존 노드의 numeric DB id를 origId 기준으로 해소하기 위한 역방향 맵을 구축합니다.

      /**
       * 예시 데이터 구조
       */
      /**
       * AddNode 결과에서 ID를 분리 처리하는 이유와 배경
       *
       * 2026-04-11 기준 재조사에서 AddNode payload에는 서로 의미가 다른 식별자가 공존했습니다.
       * 이를 구분하지 않으면 기존 노드를 업데이트해야 할 상황에서 신규 노드로 오판하거나,
       * edge가 가리키는 노드를 Mongo numeric id로 해소하지 못할 수 있습니다.
       *
       * 이 시점에 존재하는 ID 종류:
       * - `node.id`
       *   AI 배치 내부 전용 string ID입니다.
       *   예: `user-e2e-123_conv-e2e-123`
       *   예: `user-e2e-123_src0_conv-e2e-123`
       * - `node.origId`
       *   Mongo `graph_nodes.origId`로 귀결되어야 하는 원본 source ID입니다.
       *   예: `conv-e2e-123`
       *   예: `note-e2e-123`
       *   예: `src0_conv-e2e-123`
       *   예: `src1_note-e2e-123`
       * - `graph_nodes.id`
       *   Mongo에 저장되는 숫자형 내부 노드 ID입니다.
       *   예: `42`
       *
       * 왜 이렇게 수정했는가:
       * - dedup 기준은 raw `node.id`가 아니라 정규화된 `origId`여야 합니다.
       * - edge resolve는 먼저 같은 배치에서 생성한 raw string ID를 찾고,
       *   그 다음에 `{userId}_` 제거 + `src<number>_` 제거를 거쳐 기존 Mongo origId lookup으로 내려가야 합니다.
       * - 즉 "배치 내부 참조용 ID"와 "영구 저장용 origId"를 분리하지 않으면 안정적으로 동작할 수 없습니다.
       *
       * Map 예시 1: 기존 Mongo 노드 lookup
       * ```ts
       * const origIdToDbId = new Map<string, number>([
       *   ['conv-e2e-123', 11],
       *   ['note-e2e-123', 12],
       * ]);
       * ```
       *
       * Map 예시 2: 이번 배치에서 생성한 AI string ID -> Mongo numeric ID
       * ```ts
       * const createdNodeIds = new Map<string, number>([
       *   ['user-e2e-123_src0_conv-e2e-123', 11],
       *   ['user-e2e-123_src1_note-e2e-123', 12],
       *   ['user-e2e-123_conv-incremental-1712820000000', 13],
       * ]);
       * ```
       *
       * 내부 처리 흐름:
       * 1. 기존 Mongo 노드를 읽어 `정규화된 origId -> numeric DB id` 맵을 구성합니다.
       * 2. 각 `node.origId`에서 `src<number>_`를 제거해 정규화합니다.
       * 3. 정규화된 origId가 기존 맵에 있으면 update, 없으면 신규 numeric id를 발급합니다.
       * 4. 동시에 raw `node.id -> numeric DB id` 맵을 만들어 같은 배치의 edge가 참조할 수 있게 합니다.
       * 5. 이후 edge resolve는 이 두 map을 순서대로 사용합니다.
       */
      const origIdToDbId = new Map<string, number>(
        existingNodes.map((n) => [normalizeAiOrigId(n.origId).normalizedOrigId, n.id])
      );

      // 신규 노드의 AI string ID("{userId}_{origId}") → 할당될 numeric DB id 맵
      /**
       * 예시 데이터 구조
       *
       */
      const createdNodeIds: Map<string, number> = new Map();
      let totalNodesAdded = 0;
      let totalEdgesAdded = 0;
      let strippedOrigIdCount = 0;
      let unresolvedEdgeCount = 0;

      const clusterPromises: Promise<void>[] = [];
      const nodePromises: Promise<void>[] = [];

      for (const result of batchResult.results || []) {
        // 처리 실패(skipped + error)한 항목은 노드/클러스터 저장 건너뜀
        if (result.skipped && result.error) {
          logger.warn(
            {
              taskId,
              userId,
              conversationId: result.conversationId,
              noteId: result.noteId,
              error: result.error,
            },
            'AddNode result item skipped by AI pipeline — no nodes to persist'
          );
          continue;
        }

        // 대화/노트 여부 판별: sourceType과 컨텐츠 단위 수(numMessages vs numSections) 결정
        const isNote = isNoteResultItem(result);
        const sourceType = isNote ? 'markdown' : 'chat';

        // 클러스터 추가 로직 (병렬 수집)
        if (
          result.assignedCluster &&
          result.assignedCluster.isNewCluster &&
          result.assignedCluster.clusterId
        ) {
          clusterPromises.push(
            graphService.upsertCluster({
              id: result.assignedCluster.clusterId,
              userId: userId,
              name: result.assignedCluster.name || '',
              description: result.assignedCluster.reasoning || '',
              themes: result.assignedCluster.themes || [],
              size: 1,
              // createdAt/updatedAt 생략 — repository layer가 설정합니다.
            })
          );
        }

        // 노드 저장 (병렬 수집)
        for (const node of result.nodes || []) {
          const tempId = String(node.id); // AI return id format: "{userId}_{origId}"
          const normalizedOrigId: NormalizedAiOrigId = normalizeAiOrigId(node.origId);
          if (normalizedOrigId.strippedSourcePrefix) strippedOrigIdCount++;

          // [Deduplication] 기존 데이터에 동일한 origId가 있는지 확인합니다.
          // 존재한다면 해당 노드를 업데이트해야 하므로 기존의 숫자형 id를 재사용합니다.
          let dbNodeId = origIdToDbId.get(normalizedOrigId.normalizedOrigId);

          if (dbNodeId === undefined) {
            // 존재하지 않는 신규 노드인 경우에만 새로운 일련번호를 할당합니다.
            dbNodeId = nextNodeId++;
            // 배치 내 다른 엣지들이 참조할 수 있도록 맵에 등록
            origIdToDbId.set(normalizedOrigId.normalizedOrigId, dbNodeId);
          }

          createdNodeIds.set(tempId, dbNodeId);

          nodePromises.push(
            graphService.upsertNode({
              id: dbNodeId,
              userId,
              origId: normalizedOrigId.normalizedOrigId,
              clusterId: node.clusterId,
              clusterName: node.clusterName || '',
              // 대화: numMessages(Q-A 쌍 수), 노트: numSections(섹션 수) → 공통 numMessages 필드에 저장
              numMessages: isNote ? (node.numSections ?? 0) : (node.numMessages ?? 0),
              sourceType,
              embedding: [],
              timestamp: node.timestamp ?? null,
            })
          );
          totalNodesAdded++;
        }
      }

      // 클러스터 및 노드 병렬 저장 실행
      await Promise.all([...clusterPromises, ...nodePromises]);

      // 3. AddNode 완료 로그
      logger.info(
        {
          taskId,
          userId,
          existingNodeCount: existingNodes.length,
          processedItems: batchResult.results?.length || 0,
          strippedOrigIdCount,
        },
        'Normalized AddNode AI identifiers before node persistence'
      );

      /**
       * AI edge ID 해소 헬퍼.
       *
       * AI Python worker가 반환하는 source/target ID는 ChromaDB record ID 포맷인
       * "{userId}_{origId}" 문자열입니다. 이를 MongoDB numeric id로 변환합니다.
       *
       * 우선순위:
       * 1. 이번 배치에서 신규 생성된 노드 (createdNodeIds)
       * 2. origId 기반 기존 노드 조회 (origIdToDbId): "{userId}_{origId}" 에서 prefix 제거
       * 3. 레거시 numeric 문자열 (parseInt fallback)
       */
      /**
       * AI edge의 source/target을 Mongo numeric node id로 해소하는 헬퍼입니다.
       *
       * 배경:
       * - AddNode edge는 숫자형 Mongo id가 아니라 batch 전용 string ID를 들고 올 수 있습니다.
       * - 예: `user-e2e-123_src0_conv-e2e-123`
       * - 따라서 edge 저장 전에 "이번 배치에서 막 만든 노드인지", "기존 Mongo 노드인지",
       *   "이미 숫자형 문자열인지"를 순서대로 판별해야 합니다.
       *
       * 이 헬퍼가 참조하는 Map 예시:
       * ```ts
       * const createdNodeIds = new Map<string, number>([
       *   ['user-e2e-123_src0_conv-e2e-123', 11],
       *   ['user-e2e-123_src1_note-e2e-123', 12],
       * ]);
       *
       * const origIdToDbId = new Map<string, number>([
       *   ['conv-e2e-123', 11],
       *   ['note-e2e-123', 12],
       *   ['conv-incremental-1712820000000', 13],
       * ]);
       * ```
       *
       * 내부 처리 흐름:
       * 1. `createdNodeIds`에서 raw batch ID를 그대로 먼저 찾습니다.
       * 2. 없으면 `{userId}_` prefix를 제거합니다.
       * 3. 이어서 `src<number>_` namespace를 제거합니다.
       * 4. 정규화된 origId로 `origIdToDbId`를 조회합니다.
       * 5. 그래도 없으면 `parseInt()` fallback으로 숫자형 ID인지 확인합니다.
       * 6. 끝까지 해소되지 않으면 `null`을 반환하고 caller가 해당 edge를 skip합니다.
       */
      const resolveNodeId = (rawId: string): number | null => {
        // 1. 신규 노드 (이번 배치)
        const fromBatch = createdNodeIds.get(rawId);
        if (fromBatch !== undefined) return fromBatch;

        // 2. 기존 노드: "{userId}_{origId}" → origId 추출
        const origId = normalizeAiOrigId(stripUserPrefix(rawId, userId)).normalizedOrigId;
        const fromExisting = origIdToDbId.get(origId);
        if (fromExisting !== undefined) return fromExisting;

        // 3. 레거시: 숫자 문자열 직접 파싱
        const parsed = parseInt(rawId, 10);
        return isNaN(parsed) ? null : parsed;
      };

      // 두 번째 루프로 모든 엣지 저장 보장
      const edgePromises: Promise<string>[] = [];
      for (const result of batchResult.results || []) {
        for (const edge of result.edges || []) {
          const sourceId = resolveNodeId(String(edge.source));
          const targetId = resolveNodeId(String(edge.target));

          if (sourceId === null || targetId === null) {
            unresolvedEdgeCount++;
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
          totalEdgesAdded++;
        }
      }

      // 엣지 병렬 저장 실행
      await Promise.all(edgePromises);

      // 4. AddNode 완료 로그
      logger.info(
        {
          taskId,
          userId,
          totalNodesAdded,
          totalEdgesAdded,
          unresolvedEdgeCount,
        },
        'AddNode persistence finished with normalized node and edge identifiers'
      );

      // 3. GraphStats 갱신 (updatedAt은 repository가 자동으로 설정합니다)
      const stats = await graphService.getStats(userId);
      if (stats) {
        stats.status = 'UPDATED';
        await graphService.saveStats(stats);
      }

      // 3.4.1. PostHog 이벤트 수집 (Add Node 완료 가치 측정)
      captureEvent(userId, 'macro_graph_updated', {
        nodes_added: totalNodesAdded,
        edges_added: totalEdgesAdded,
        processed_count: batchResult.processedCount || 0,
      });

      // 4. 알림 전송 병렬화
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
}
