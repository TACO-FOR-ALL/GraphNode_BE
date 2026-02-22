import { JobHandler } from './JobHandler';
import { Container } from '../../bootstrap/container';
import { AddConversationRequestPayload } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { HttpClient } from '../../infra/http/httpClient';
import { NotificationType } from '../notificationType';

const AI_SERVER_URI = process.env.AI_SERVER_URI || 'http://localhost:8000';

/**
 * 단일 대화 추가 요청 처리 핸들러
 *
 * Flow:
 * 1. S3에서 conversation 데이터 다운로드
 * 2. AI 서버 /add-node 호출
 * 3. 결과(노드, 엣지)를 MongoDB에 저장
 */
export class AddConversationRequestHandler implements JobHandler {
  private readonly httpClient: HttpClient;

  constructor() {
    this.httpClient = new HttpClient('AddNodeAI', {
      baseURL: AI_SERVER_URI,
      timeout: 300000, // 5분
    });
  }

  async handle(message: AddConversationRequestPayload, container: Container): Promise<void> {
    const { payload, taskId } = message;
    const { userId, conversationId, s3Key } = payload;

    logger.info({ taskId, userId, conversationId }, 'Handling add conversation request');

    const storagePort = container.getAwsS3Adapter();
    const graphService = container.getGraphEmbeddingService();
    const notiService = container.getNotificationService();

    try {
      // 1. S3에서 데이터 다운로드
      const inputData = await storagePort.downloadJson<{
        conversation: any;
        userId: string;
        existingClusters: any[];
      }>(s3Key);

      // 2. AI 서버 /add-node 호출
      const aiResult = await this.httpClient.post<{
        nodes: any[];
        edges: any[];
        assignedCluster: {
          clusterId: string;
          isNewCluster: boolean;
          confidence: number;
          reasoning: string;
          name?: string;
          themes?: string[];
        };
      }>('/add-node', inputData);

      // 3. MongoDB에 저장
      // 노드 ID 생성 (기존 노드들의 max ID + 1)
      const existingNodes = await graphService.listNodes(userId);
      const nextNodeId = existingNodes.length > 0
        ? Math.max(...existingNodes.map(n => n.id)) + 1
        : 1;

      const createdNodeIds: Map<number, number> = new Map(); // tempId -> realId

      // 노드 저장 (항상 1개만 추가)
      for (const node of aiResult.nodes) {
        const tempId = node.id;  // -1 (AI 서버에서 설정한 임시 ID)
        createdNodeIds.set(tempId, nextNodeId);

        await graphService.upsertNode({
          id: nextNodeId,
          userId,
          origId: node.origId,
          clusterId: node.clusterId,
          clusterName: node.clusterName || '',
          numMessages: node.numMessages || 0,
          embedding: node.embedding || [],
          timestamp: node.timestamp || null,
        });
      }

      // 엣지 저장
      for (const edge of aiResult.edges) {
        const sourceId = createdNodeIds.get(edge.source) || edge.source;
        await graphService.upsertEdge({
          userId,
          source: sourceId,
          target: edge.target,
          weight: edge.weight || 1.0,
          type: edge.type || 'similarity',
          intraCluster: edge.intraCluster ?? true,
        });
      }

      // 클러스터 저장 (새 클러스터인 경우)
      // 이부분은 아예 llm에게 새 클러스터를 요청하는 경우는 없게 하는 방안도 생각중
      if (aiResult.assignedCluster?.isNewCluster) {
        const newClusterId = aiResult.assignedCluster.clusterId;
        const clusterName = aiResult.assignedCluster.name || 'New Cluster';
        const clusterThemes = aiResult.assignedCluster.themes || [];

        await graphService.upsertCluster({
          id: newClusterId,
          userId,
          name: clusterName,
          description: aiResult.assignedCluster.reasoning || '',
          themes: clusterThemes,
          size: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      // 4. 성공 알림 전송
      await notiService.sendNotification(userId, NotificationType.ADD_CONVERSATION_COMPLETED, {
        taskId,
        conversationId,
        nodeCount: aiResult.nodes.length,
        edgeCount: aiResult.edges.length,
        assignedCluster: aiResult.assignedCluster,
        timestamp: new Date().toISOString(),
      });
      await notiService.sendFcmPushNotification(
        userId,
        'Conversation Added',
        'Your conversation is added to graph',
        {
          taskId,
          status: 'COMPLETED',
        }
      );

    } catch (err) {
      logger.error({ err, taskId, userId, conversationId }, 'Failed to add conversation to graph');

      // 실패 알림 전송
      await notiService.sendNotification(userId, NotificationType.ADD_CONVERSATION_FAILED, {
        taskId,
        conversationId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
      await notiService.sendFcmPushNotification(
        userId,
        'Conversation Added Failed',
        'Your conversation is failed to add to graph',
        {
          taskId,
          status: 'FAILED',
        }
      );
      throw err;
    }
  }
}
