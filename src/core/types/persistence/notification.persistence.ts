export type NotificationTypeString = string;

/**
 * Notification Document (MongoDB)
 * Collection: notifications
 *
 * - `_id`는 SSE 재연결 시 replay를 위한 커서(cursor)로 사용합니다.
 *   - ULID처럼 "문자열 정렬이 시간 정렬과 일치하는" 값을 권장합니다.
 * - `expiresAt`는 TTL 기반 보관 정책을 위한 선택 필드입니다.
 */
export interface NotificationDoc {
  _id: string; // 커서(cursor) (예: ULID)
  userId: string;
  type: NotificationTypeString;
  payload: unknown;
  createdAt: number; // epoch ms
  expiresAt?: number; // epoch ms (TTL 인덱스 타겟)
}

