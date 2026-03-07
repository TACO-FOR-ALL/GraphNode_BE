import cron from 'node-cron';
import { container } from '../../bootstrap/container';
import { logger } from '../../shared/utils/logger';

/**
 * CleanupCron 클래스
 *
 * 책임:
 * - 매일 특정 시간(예: 매일 자정 00:00)에 실행되어 소프트 삭제된 지 30일이 지난 아이템들을 영구 삭제합니다.
 * - 대상: Conversations, Notes, Folders
 */
export class CleanupCron {
  /**
   * 크론 잡을 시작합니다.
   * 서버 부트스트랩 시점에 호출되어야 합니다.
   */
  static start(): void {
    // 매일 00:00에 실행
    cron.schedule('0 0 * * *', async () => {
      logger.info('[CleanupCron] Starting daily cleanup task...');
      try {
        await this.runCleanup();
        logger.info('[CleanupCron] Daily cleanup task completed successfully.');
      } catch (err) {
        logger.error({ err }, '[CleanupCron] Daily cleanup task failed');
      }
    });

    logger.info('[CleanupCron] Scheduled daily cleanup task (at 00:00).');
  }

  /**
   * 실제 정리 로직을 수행합니다.
   */
  private static async runCleanup(): Promise<void> {
    const expiredBefore = new Date();
    expiredBefore.setDate(expiredBefore.getDate() - 30); // 30일 전

    const chatManagementService = container.getChatManagementService();
    const noteService = container.getNoteService();

    // 1. 대화(Conversations) 및 연관 메시지/그래프 정리
    const deletedConvs = await chatManagementService.cleanupExpiredConversations(expiredBefore);
    if (deletedConvs > 0) {
      logger.info(`[CleanupCron] Hard deleted ${deletedConvs} expired conversations (including messages and graph nodes).`);
    }

    // 2. 노트(Notes) 및 폴더(Folders) 연쇄 정리
    const deletedItems = await noteService.cleanupExpiredNotesAndFolders(expiredBefore);
    if (deletedItems > 0) {
      logger.info(`[CleanupCron] Hard deleted ${deletedItems} expired notes/folders (including recursive cascade and graph nodes).`);
    }
  }
}
