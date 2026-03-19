import { Collection } from 'mongodb';

import type { NotificationRepository } from '../../core/ports/NotificationRepository';
import type { NotificationDoc } from '../../core/types/persistence/notification.persistence';
import { getMongo } from '../db/mongodb';
import { UpstreamError } from '../../shared/errors/domain';

export class NotificationRepositoryMongo implements NotificationRepository {
  private col(): Collection<NotificationDoc> {
    // 알림 이력 컬렉션
    return getMongo().db().collection<NotificationDoc>('notifications');
  }

  /**
   * 알림 이력을 저장합니다.
   * @param doc 저장할 알림 문서
   */
  async insert(doc: NotificationDoc): Promise<void> {
    try {
      // 알림 이력 저장(append-only)
      await this.col().insertOne(doc);
    } catch (err: unknown) {
      throw new UpstreamError('Failed to insert notification', { originalError: err });
    }
  }

  /**
   * 특정 사용자 ID 이후의 알림을 조회합니다.
   * @param userId 사용자 ID
   * @param afterCursor 커서(cursor)
   * @param limit 제한
   * @returns 조회된 알림 문서
   */
  async listAfter(
    userId: string,
    afterCursor: string | null,
    limit: number
  ): Promise<NotificationDoc[]> {
    try {
      if (limit <= 0) return [];

      // SSE 재연결 replay를 위한 조회
      // - 특정 사용자의 커서 이후(배타적) 문서만 조회
      const query: any = { userId };
      if (afterCursor) {
        query._id = { $gt: afterCursor };
      }

      // ULID는 문자열 정렬이 시간 정렬과 일치하므로, `_id` 오름차순이 곧 시간 오름차순이 됩니다.
      return await this.col().find(query).sort({ _id: 1 }).limit(limit).toArray();
    } catch (err: unknown) {
      throw new UpstreamError('Failed to list notifications', { originalError: err });
    }
  }
}
