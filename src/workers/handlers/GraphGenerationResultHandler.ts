import { Readable } from 'stream';

import { JobHandler } from './JobHandler';
import { Container } from '../../bootstrap/container';
import { GraphGenResultPayload } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { mapAiOutputToSnapshot } from '../../shared/mappers/ai_graph_output.mapper';
import { PersistGraphPayloadDto } from '../../shared/dtos/graph';
import { AiGraphOutputDto } from '../../shared/dtos/ai_graph_output';

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

        // 실패 알림 전송(Redis Pub/Sub & FCM)
        await notiService.sendNotification(userId, 'GRAPH_GENERATION_FAILED', {
          taskId,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
        await notiService.sendFcmPushNotification(
          userId,
          'Graph Generation Failed',
          'Failed to generate knowledge graph. Please try again.',
          { type: 'GRAPH_GENERATION_FAILED', taskId, error: errorMsg }
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

        logger.info({ taskId, userId }, 'Graph snapshot persisted to DB');

        // 3.5. Vector DB 저장 (Features)
        if (payload.featuresS3Key) {
          try {
            const graphVectorService = container.getGraphVectorService(); // Use Service
            const features = await storagePort.downloadJson<any>(payload.featuresS3Key);
            await graphVectorService.saveGraphFeatures(userId, features);
            logger.info({ taskId, userId }, 'Graph features persisted to Vector DB via Service');
          } catch (featureErr) {
            logger.error({ err: featureErr, taskId }, 'Failed to persist graph features (Non-fatal)');
            throw featureErr;
          }
        }



        // 4. 성공 알림 전송
        await notiService.sendNotification(userId, 'GRAPH_GENERATION_COMPLETED', {
          taskId,
          nodeCount: snapshot.nodes.length,
          edgeCount: snapshot.edges.length,
          timestamp: new Date().toISOString(),
        });
        await notiService.sendFcmPushNotification(
          userId,
          'Graph Ready',
          `Your knowledge graph (${snapshot.nodes.length} nodes) is ready!`,
          { type: 'GRAPH_GENERATION_COMPLETED', taskId }
        );
      }
    } catch (err) {
      logger.error({ err, taskId, userId }, 'Error processing graph generation result');
      // 여기서 에러를 던지면 sqs-consumer가 메시지를 삭제하지 않고 재시도 처리함 (설정에 따라 DLQ 이동)
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
