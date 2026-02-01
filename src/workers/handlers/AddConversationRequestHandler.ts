import { JobHandler } from './JobHandler';
import { Container } from '../../bootstrap/container';
import { AddConversationRequestPayload } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { HttpClient } from '../../infra/http/httpClient';

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
      logger.info({ s3Key }, 'Downloading conversation data from S3');
      const inputData = await storagePort.downloadJson<{
        conversation: any;
        userId: string;
        existingClusters: any[];
      }>(s3Key);

      // 2. AI 서버 /add-node 호출
      logger.info({ conversationId }, 'Calling AI server /add-node');
      const aiResult = await this.httpClient.post<{
        nodes: any[];
        edges: any[];
        assignedCluster: {
          clusterId: string;
          isNewCluster: boolean;
          confidence: number;
          reasoning: string;
        };
      }>('/add-node', inputData);

      logger.info(
        { conversationId, nodeCount: aiResult.nodes.length, edgeCount: aiResult.edges.length },
        'AI server returned result'
      );

      // 3. MongoDB에 저장
      // 노드 ID 생성 (기존 노드들의 max ID + 1)
      const existingNodes = await graphService.listNodes(userId);
      let nextNodeId = existingNodes.length > 0
        ? Math.max(...existingNodes.map(n => n.id)) + 1
        : 1;

      const createdNodeIds: Map<number, number> = new Map(); // tempId -> realId

      // 노드 저장
      for (const node of aiResult.nodes) {
        const nodeId = nextNodeId++;
        createdNodeIds.set(node._tempId || 1, nodeId);

        await graphService.upsertNode({
          id: nodeId,
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
        });
      }

      logger.info({ taskId, userId, conversationId }, 'Conversation added to graph successfully');

      // 4. 성공 알림 전송
      await notiService.sendNotification(userId, 'ADD_CONVERSATION_COMPLETED', {
        taskId,
        conversationId,
        nodeCount: aiResult.nodes.length,
        edgeCount: aiResult.edges.length,
        assignedCluster: aiResult.assignedCluster,
        timestamp: new Date().toISOString(),
      });

    } catch (err) {
      logger.error({ err, taskId, userId, conversationId }, 'Failed to add conversation to graph');

      // 실패 알림 전송
      await notiService.sendNotification(userId, 'ADD_CONVERSATION_FAILED', {
        taskId,
        conversationId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });

      throw err;
    }
  }
}
