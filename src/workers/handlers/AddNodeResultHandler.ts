import { JobHandler } from './JobHandler';
import { Container } from '../../bootstrap/container';
import { AddNodeResultPayload } from '../../shared/dtos/queue';
import { AiAddNodeBatchResult, isNoteResultItem } from '../../shared/dtos/ai_graph_output';
import { logger } from '../../shared/utils/logger';
import { withRetry } from '../../shared/utils/retry';
import { captureEvent } from '../../shared/utils/posthog';

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
      const existingNodes = await graphService.listNodes(userId);
      let nextNodeId =
        existingNodes.length > 0 ? Math.max(...existingNodes.map((n) => n.id)) + 1 : 1;

      // AI가 반환하는 엣지 target은 ChromaDB record ID 포맷인 "{userId}_{origId}"입니다.
      // 기존 노드의 numeric DB id를 origId 기준으로 해소하기 위한 역방향 맵을 구축합니다.
      const origIdToDbId = new Map<string, number>(existingNodes.map((n) => [n.origId, n.id]));

      // 신규 노드의 AI string ID("{userId}_{origId}") → 할당될 numeric DB id 맵
      const createdNodeIds: Map<string, number> = new Map();
      let totalNodesAdded = 0;
      let totalEdgesAdded = 0;

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
          const tempId = String(node.id); // "{userId}_{origId}" format
          const dbNodeId = nextNodeId++;
          createdNodeIds.set(tempId, dbNodeId);
          // 배치 내 신규 노드도 origId 맵에 추가 (배치 내 항목끼리 엣지 연결 시 참조 가능하도록)
          origIdToDbId.set(node.origId, dbNodeId);

          nodePromises.push(
            graphService.upsertNode({
              id: dbNodeId,
              userId,
              origId: node.origId,
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
      const resolveNodeId = (rawId: string): number | null => {
        // 1. 신규 노드 (이번 배치)
        const fromBatch = createdNodeIds.get(rawId);
        if (fromBatch !== undefined) return fromBatch;

        // 2. 기존 노드: "{userId}_{origId}" → origId 추출
        const prefix = userId + '_';
        const origId = rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
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
