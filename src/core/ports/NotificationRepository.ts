import type { NotificationDoc } from '../types/persistence/notification.persistence';

export interface NotificationRepository {
  /**
   * SSE 재연결 시 replay를 위해 알림 이력을 저장합니다.
   */
  insert(doc: NotificationDoc): Promise<void>;

  /**
   * 특정 커서 이후(배타적, exclusive)의 알림 이력을 커서 오름차순으로 조회합니다.
   *
   * @param userId 대상 사용자
   * @param afterCursor 다음 커서. null이면 "최신 N개" 등 구현체 정책에 따릅니다.
   * @param limit 최대 조회 개수
   */
  listAfter(
    userId: string,
    afterCursor: string | null,
    limit: number
  ): Promise<NotificationDoc[]>;
}
