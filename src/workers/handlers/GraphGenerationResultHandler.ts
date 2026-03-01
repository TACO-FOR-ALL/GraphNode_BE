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
        await notiService.sendNotification(userId, NotificationType.GRAPH_GENERATION_FAILED, {
          taskId,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
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
        // 1. S3에서 결과 JSON 다운로드
        const aiGraphOutput: AiGraphOutputDto =
          await storagePort.downloadJson<AiGraphOutputDto>(resultS3Key);

        // 2. Mapper를 통해 DTO 변환
        const snapshot = mapAiOutputToSnapshot(aiGraphOutput, userId);

        // 3. DB 저장 (기존 Service 로직 재사용)
        const persistPayload: PersistGraphPayloadDto = {
          userId,
          snapshot,
        };
        await graphService.persistSnapshot(persistPayload);

        // 3.5. Vector DB 저장 (Features + Cluster Info Merge)
        if (payload.featuresS3Key) {
          try {
            const graphVectorService = container.getGraphVectorService();
            
            // features.json 다운로드 (Embeddings)
            const features = await storagePort.downloadJson<GraphFeaturesJsonDto>(payload.featuresS3Key);
            
            // graph_final.json (Nodes with Cluster Info) - 이미 aiGraphOutput에 있음
            // Mapping: orig_id -> Node Info
            const nodeMap = new Map<string, typeof aiGraphOutput.nodes[0]>();
            aiGraphOutput.nodes.forEach(node => {
              nodeMap.set(node.orig_id, node);
            });

            // Merge & Transform to Vector Items
            const vectorItems = features.conversations.map((conv, idx) => {
              const vector = features.embeddings[idx];
              const nodeInfo = nodeMap.get(conv.orig_id);

              // 클러스터 정보가 없으면 기본값 or 'unknown'
              const clusterId = nodeInfo?.cluster_id || 'unknown';
              const clusterName = nodeInfo?.cluster_name || 'Unclustered';

              // Keywords: Obj Array -> String (comma separated)
              const keywordsStr = conv.keywords.map(k => k.term).join(',');

              // Construct Metadata (Snake Case)
              const metadata: any = {
                user_id: userId,
                conversation_id: conv.orig_id,
                orig_id: conv.orig_id,
                node_id: conv.id,
                cluster_id: clusterId,
                cluster_name: clusterName,
                keywords: keywordsStr,
                create_time: conv.create_time || 0,
                num_messages: conv.num_sections || 0, // Fallback to 0 if undefined
                source_type: conv.source_type || 'chat',
                update_time: conv.update_time || 0
              };

              return {
                id: `${userId}_${conv.orig_id}`, // Composite ID for Vector DB
                vector: vector,
                payload: metadata // 'metadata' property in interface is mapped to 'payload' in VectorItem
              };
            });

            await graphVectorService.saveGraphFeatures(userId, vectorItems);
          } catch (featureErr) {
            logger.error({ err: featureErr, taskId }, 'Failed to persist graph features (Non-fatal)');
            // Vector DB 저장이 실패해도 DB 저장은 성공했으므로 전체 재시도는 하지 않음 (Non-fatal)
          }
        }

        // 3.8. Summary DB 저장 (if included)
        if (payload.summaryIncluded && payload.summaryS3Key) {
          try {
            logger.info({ taskId, userId }, 'Processing integrated graph summary from result');
            const summaryJson = await storagePort.downloadJson<GraphSummary>(payload.summaryS3Key);

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
        }

        // 4. 성공 알림 전송
        await notiService.sendNotification(userId, NotificationType.GRAPH_GENERATION_COMPLETED, {
          taskId,
          nodeCount: snapshot.nodes.length,
          edgeCount: snapshot.edges.length,
          timestamp: new Date().toISOString(),
        });
        await notiService.sendFcmPushNotification(
          userId,
          'Graph Ready',
          `Your knowledge graph (${snapshot.nodes.length} nodes) is ready!`,
          { type: NotificationType.GRAPH_GENERATION_COMPLETED, taskId }
        );
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

        // 실패 알림 전송 (에러 발생 시점)
        await notiService.sendNotification(userId, NotificationType.GRAPH_GENERATION_FAILED, {
          taskId,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
        await notiService.sendFcmPushNotification(
          userId,
          'Graph Generation Failed',
          'Failed to generate knowledge graph. Please try again.',
          { type: NotificationType.GRAPH_GENERATION_FAILED, taskId, error: errorMsg }
        );
      } catch (fallbackErr) {
        logger.error({ err: fallbackErr, taskId, userId }, 'Failed to send fallback error notification');
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
