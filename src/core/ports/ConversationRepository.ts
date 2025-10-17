import { Conversation } from '../domain/Conversation';

/**
 * ConversationRepository Port
 * - 대화 문서의 저장/조회/커서 페이징을 정의한다.
 * - 구현은 infra 레이어(예: MongoDB)에서 제공한다.
 */
export interface ConversationRepository {
  /**
   * 신규 대화 생성
   * @param ownerUserId 사용자 ID
   * @param title 제목(1~200자 가정)
   * @returns 생성된 Conversation
   * @example
   * const conv = await repo.create(1, 'New Conversation');
   */
  create(ownerUserId: number, title: string): Promise<Conversation>;
  /**
   * ID로 단건 조회
   * @param id 대화 ID(UUID/ULID)
   * @returns Conversation 또는 null
   * @example
   * const conv = await repo.findById('c_123');
   */
  findById(id: string): Promise<Conversation | null>;
  /**
   * 소유자 기준으로 최신순 페이지를 조회한다.
   * @param ownerUserId 소유 사용자 ID
   * @param limit 반환 개수 상한(1~100)
   * @param cursor 다음 페이지 커서(opaque)
   * @returns 항목 목록과 nextCursor(없으면 null)
   * @example
   * const { items, nextCursor } = await repo.listByOwner(1, 20);
   */
  listByOwner(ownerUserId: number, limit: number, cursor?: string): Promise<{ items: Conversation[]; nextCursor?: string | null }>;
}
