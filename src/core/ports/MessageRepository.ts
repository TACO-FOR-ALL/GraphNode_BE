import { Message } from '../domain/Message';

/**
 * MessageRepository Port
 * - 메시지 생성 및 대화별 페이징 조회 계약을 정의한다.
 */
export interface MessageRepository {
  /**
   * 메시지 생성
   * @param input 대화ID/역할/본문
   * @returns 생성된 Message
   * @example
   * const msg = await repo.create({ conversationId: 'c_1', role: 'user', text: 'hi' });
   */
  create(input: { conversationId: string; role: 'user'|'assistant'|'system'; text: string }): Promise<Message>;
  /**
   * 대화별 메시지 목록 페이징 조회
   * @param conversationId 대화 ID
   * @param limit 페이지 크기(1~100)
   * @param cursor 다음 페이지 커서(opaque)
   * @returns 항목 목록과 nextCursor(없으면 null)
   * @example
   * const { items, nextCursor } = await repo.listByConversation('c_1', 50);
   */
  listByConversation(conversationId: string, limit: number, cursor?: string): Promise<{ items: Message[]; nextCursor?: string | null }>;
}
