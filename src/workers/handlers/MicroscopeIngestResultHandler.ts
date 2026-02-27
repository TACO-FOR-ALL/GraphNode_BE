import { JobHandler } from './JobHandler';
import type { Container } from '../../bootstrap/container';
import { MicroscopeIngestResultQueuePayload } from '../../shared/dtos/queue';
import { logger } from '../../shared/utils/logger';
import { NotificationType } from '../notificationType';

/**
 * Microscope 문서 분석(Ingest) 결과 처리 핸들러
 *
 * Flow:
 * 1. AI 서버 워커가 문서 분석(그래프 생성)을 마치고 SQS로 반환한 결과를 수신
 * 2. MicroscopeManagementService를 통해 해당 문서의 진행 상태 갱신 (MongoDB)
 * 3. 개별 파일 처리 완료(성공/실패) 알림을 사용자에게 발송
 * 4. 대상 워크스페이스 내 모든 문서 처리가 완료되었는지 확인하고 합산 통계(개수)와 함께 "전체 종료" 알림 발송
 */
export class MicroscopeIngestResultHandler implements JobHandler {
  async handle(message: MicroscopeIngestResultQueuePayload, container: Container): Promise<void> {
    const { payload, taskId } = message;
    const { user_id, group_id, status, source_id, chunks_count, error } = payload;

    // AI Python 워커가 보내는 snake_case 데이터를 camelCase 위주 백엔드 구조로 매핑
    const userId = user_id;
    const groupId = group_id;
    const sourceId = source_id;
    
    // Envelope의 taskId를 통해 문서 ID 식별
    const docId = taskId;

    logger.info({ taskId, userId, groupId, status }, 'Handling Microscope ingest result');

    // 의존성 획득
    const microscopeService = container.getMicroscopeManagementService();
    const notiService = container.getNotificationService();

    try {
      // 1. 서비스 호출을 통한 개별 문서 진행상태 갱신 및 전체 문서 상태 진단
      const updatedWorkspace = await microscopeService.updateDocumentStatus(
        userId,
        groupId,
        docId,
        status,
        sourceId,
        error
      );

      // S3 Key 값은 Workspace에서 찾아서 알림용으로 활용합니다.
      const targetDoc = updatedWorkspace.documents.find(d => d.id === docId);
      const s3Key = targetDoc?.s3Key || 'unknown_s3_key';

      // 2. 단일 파일 처리 완료(혹은 실패) Noti 발송
      if (status === 'FAILED') {
        const errorMsg = error || 'Unknown error from Microscope AI Pipeline';
        logger.warn({ taskId, userId, groupId, s3Key, error: errorMsg }, 'Microscope document processing failed');
        
        await notiService.sendNotification(userId, NotificationType.MICROSCOPE_DOCUMENT_FAILED, {
          taskId,
          groupId,
          s3Key,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.info({ taskId, userId, groupId, s3Key, chunks_count }, 'Microscope document processing completed successfully');
        
        await notiService.sendNotification(userId, NotificationType.MICROSCOPE_DOCUMENT_COMPLETED, {
          taskId,
          groupId,
          s3Key,
          sourceId,
          chunksCount: chunks_count,
          timestamp: new Date().toISOString(),
        });
      }

      // 3. 워크스페이스 내에 남은 PENDING/PROCESSING 문서가 있는지 검사하여 최종 종합 Noti 판별
      const totalDocs = updatedWorkspace.documents.length;
      let completedCount = 0;
      let failedCount = 0;
      let pendingCount = 0;

      for (const doc of updatedWorkspace.documents) {
        if (doc.status === 'COMPLETED') completedCount++;
        else if (doc.status === 'FAILED') failedCount++;
        else pendingCount++;
      }

      // 대기 중인 문서가 하나도 없다면, 모든 작업이 완료된 것임!
      if (pendingCount === 0) {
        logger.info({ userId, groupId, totalDocs, completedCount, failedCount }, 'All documents in Microscope workspace have been processed');
        
        await notiService.sendNotification(userId, NotificationType.MICROSCOPE_WORKSPACE_COMPLETED, {
          groupId,
          workspaceName: updatedWorkspace.name,
          totalDocs,
          completedCount,
          failedCount,
          timestamp: new Date().toISOString(),
        });

        // FCM 푸시 알림 (전체 완료 건)
        await notiService.sendFcmPushNotification(
          userId,
          'Microscope Workspace Ready',
          `Your workspace "${updatedWorkspace.name}" is ready! (${completedCount} passed, ${failedCount} failed)`,
          {
            type: NotificationType.MICROSCOPE_WORKSPACE_COMPLETED,
            groupId,
            completedCount: String(completedCount),
          }
        );
      }
    } catch (err) {
      logger.error({ err, taskId, userId, groupId, docId }, 'Exception during Microscope Result Handling');
      // 핸들링 도중 발생한 에러 기록 시 SQS 큐가 재전송(nack)하도록 throw 유지 결정 가능
      // 여기서는 메시지 소모를 방해하지 않도록 처리합니다. (단일 업데이트 실패이므로 Retry 고려)
      throw err;
    }
  }
}
