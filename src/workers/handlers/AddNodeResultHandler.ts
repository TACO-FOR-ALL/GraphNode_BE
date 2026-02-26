import { JobHandler } from './JobHandler';
import { Container } from '../../bootstrap/container';
import { AddNodeResultPayload } from '../../shared/dtos/queue';
import { AiAddNodeBatchResult } from '../../shared/dtos/ai_graph_output';
import { logger } from '../../shared/utils/logger';
import { NotificationType } from '../notificationType';

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

    const storagePort = container.getAwsS3Adapter();
    const graphService = container.getGraphEmbeddingService();
    const notiService = container.getNotificationService();

    if (status === 'FAILED' || error) {
      logger.error({ taskId, userId, error }, 'AddNode task failed from AI Server');
      await notiService.sendNotification(userId, NotificationType.ADD_CONVERSATION_FAILED, {
        taskId,
        error: error || 'Unknown AI error',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!resultS3Key) {
      throw new Error('No resultS3Key provided for ADD_NODE_RESULT');
    }

    try {
      // 1. S3에서 결과 다운로드
      const batchResult = await storagePort.downloadJson<AiAddNodeBatchResult>(resultS3Key);

      // 2. DB 저장 (클러스터 생성, 노드 및 엣지 반영)
      const existingNodes = await graphService.listNodes(userId);
      let nextNodeId = existingNodes.length > 0
        ? Math.max(...existingNodes.map(n => n.id)) + 1
        : 1;

      const createdNodeIds: Map<string, number> = new Map();
      let totalNodesAdded = 0;
      let totalEdgesAdded = 0;

      for (const result of batchResult.results || []) {
        // 클러스터 추가 로직
        if (result.assignedCluster && result.assignedCluster.isNewCluster && result.assignedCluster.clusterId) {
            await graphService.upsertCluster({
                id: result.assignedCluster.clusterId,
                userId: userId,
                name: result.assignedCluster.name || '',
                description: result.assignedCluster.reasoning || '',
                themes: result.assignedCluster.themes || [],
                size: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        // 노드 저장
        for (const node of result.nodes || []) {
          const tempId = String(node.id);
          const dbNodeId = nextNodeId++;
          createdNodeIds.set(tempId, dbNodeId);

          await graphService.upsertNode({
            id: dbNodeId,
            userId,
            origId: node.origId,
            clusterId: node.clusterId,
            clusterName: node.clusterName || '',
            numMessages: node.num_messages || node.num_sections || 0, // Fallback for ai result
            sourceType: node.sourceType || 'chat',
            embedding: node.embedding || [],
            timestamp: node.timestamp || null,
          });
          totalNodesAdded++;
        }
      }

      // 두 번째 루프로 모든 엣지 저장 보장
      for (const result of batchResult.results || []) {
        for (const edge of result.edges || []) {
            const sourceIdStr = String(edge.source);
            const sourceId = createdNodeIds.get(sourceIdStr) ?? parseInt(sourceIdStr, 10);
            
            const targetIdStr = String(edge.target);
            const targetId = createdNodeIds.get(targetIdStr) ?? parseInt(targetIdStr, 10);

            if (!isNaN(sourceId) && !isNaN(targetId)) {
                await graphService.upsertEdge({
                    userId,
                    source: sourceId,
                    target: targetId,
                    weight: edge.weight || 1.0,
                    type: (edge.type || 'similarity') as any, // Cast to any to bypass strict type checking
                    intraCluster: edge.intraCluster ?? true,
                });
                totalEdgesAdded++;
            }
        }
      }

      // 3. GraphStats 갱신 (updatedAt 반영)
      // 변경된 노드/엣지 개수도 GraphStats를 직접 업데이트할 필요가 있는지?
      // 기존 아키텍처 상 upsertNode에서 EventObserver가 총량을 조절하거나,
      // 혹은 통계 자체의 updatedAt을 갱신하는 것이 주요하다고 판단됨.
      const stats = await graphService.getStats(userId);
      if (stats) {
          stats.updatedAt = new Date().toISOString();
          await graphService.saveStats(stats);
      }

      // 4. 알림 전송
      await notiService.sendNotification(userId, NotificationType.ADD_CONVERSATION_COMPLETED, {
        taskId,
        nodeCount: totalNodesAdded,
        edgeCount: totalEdgesAdded,
        timestamp: new Date().toISOString(),
      });
      await notiService.sendFcmPushNotification(
        userId,
        'Graph Updated',
        'Your conversations are successfully added to your knowledge graph.',
        { taskId, status: 'COMPLETED' }
      );

    } catch (err) {
      logger.error({ err, taskId, userId }, 'Failed to process add node result');

      await notiService.sendNotification(userId, NotificationType.ADD_CONVERSATION_FAILED, {
        taskId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
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

