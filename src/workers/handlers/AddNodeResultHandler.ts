import { JobHandler } from './JobHandler';
import { Container } from '../../bootstrap/container';
import { AddNodeResultPayload } from '../../shared/dtos/queue';
import { AiAddNodeBatchResult } from '../../shared/dtos/ai_graph_output';
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
      let nextNodeId = existingNodes.length > 0
        ? Math.max(...existingNodes.map(n => n.id)) + 1
        : 1;

      const createdNodeIds: Map<string, number> = new Map();
      let totalNodesAdded = 0;
      let totalEdgesAdded = 0;

      const clusterPromises: Promise<void>[] = [];
      const nodePromises: Promise<void>[] = [];
      
      for (const result of batchResult.results || []) {
        // 클러스터 추가 로직 (병렬 수집)
        if (result.assignedCluster && result.assignedCluster.isNewCluster && result.assignedCluster.clusterId) {
            clusterPromises.push(graphService.upsertCluster({
                id: result.assignedCluster.clusterId,
                userId: userId,
                name: result.assignedCluster.name || '',
                description: result.assignedCluster.reasoning || '',
                themes: result.assignedCluster.themes || [],
                size: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));
        }

        // 노드 저장 (병렬 수집)
        for (const node of result.nodes || []) {
          const tempId = String(node.id);
          const dbNodeId = nextNodeId++;
          createdNodeIds.set(tempId, dbNodeId);

          nodePromises.push(graphService.upsertNode({
            id: dbNodeId,
            userId,
            origId: node.origId,
            clusterId: node.clusterId,
            clusterName: node.clusterName || '',
            numMessages: node.numMessages || 0, // Fallback for ai result
            sourceType: 'chat', // For AddNode, default to chat
            embedding: [],
            timestamp: node.timestamp || null,
          }));
          totalNodesAdded++;
        }
      }
      
      // 클러스터 및 노드 병렬 저장 실행
      await Promise.all([...clusterPromises, ...nodePromises]);

      // 두 번째 루프로 모든 엣지 저장 보장
      const edgePromises: Promise<string>[] = [];
      for (const result of batchResult.results || []) {
        for (const edge of result.edges || []) {
            const sourceIdStr = String(edge.source);
            const sourceId = createdNodeIds.get(sourceIdStr) ?? parseInt(sourceIdStr, 10);
            
            const targetIdStr = String(edge.target);
            const targetId = createdNodeIds.get(targetIdStr) ?? parseInt(targetIdStr, 10);

            if (!isNaN(sourceId) && !isNaN(targetId)) {
                edgePromises.push(graphService.upsertEdge({
                    userId,
                    source: sourceId,
                    target: targetId,
                    weight: edge.weight || 1.0,
                    type: (edge.type || 'similarity') as any, // Cast to any to bypass strict type checking
                    intraCluster: edge.intraCluster ?? true,
                }));
                totalEdgesAdded++;
            }
        }
      }
      
      // 엣지 병렬 저장 실행
      await Promise.all(edgePromises);

      // 3. GraphStats 갱신 (updatedAt 반영)
      // 변경된 노드/엣지 개수도 GraphStats를 직접 업데이트할 필요가 있는지?
      // 기존 아키텍처 상 upsertNode에서 EventObserver가 총량을 조절하거나,
      // 혹은 통계 자체의 updatedAt을 갱신하는 것이 주요하다고 판단됨.
      const stats = await graphService.getStats(userId);
      if (stats) {
          stats.updatedAt = new Date().toISOString();
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
        )
      ]);

    } catch (err) {
      logger.error({ err, taskId, userId }, 'Failed to process add node result');

      await notiService.sendAddConversationFailed(userId, taskId, err instanceof Error ? err.message : String(err));
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

