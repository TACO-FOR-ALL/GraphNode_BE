/**
 * 모듈: MessageRepository Port
 * 책임: 메시지 문서의 CRUD 및 조회를 위한 포트를 정의한다.
 * 외부 의존: 없음.
 */
import type { MessageDoc } from '../types/persistence/ai.persistence';

/**
 * MessageRepository Port
 * - 메시지 문서의 CRUD 및 조회를 위한 계약을 정의한다.
 * - 구현은 infra 레이어(예: MongoDB)에서 제공한다.
 * - **Rule 1**: Repository는 오직 Persistence Type(`*Doc`)만 다룬다. DTO 변환은 Service/Mapper 책임.
 */
export interface MessageRepository {
  /**
   * 단일 메시지 생성.
   * @param doc 저장할 메시지 문서.
   * @returns 저장된 메시지 문서.
   */
  create(doc: MessageDoc): Promise<MessageDoc>;

  /**
   * 여러 메시지를 한 번에 생성 (Bulk Insert).
   * @param docs 저장할 메시지 문서 배열.
   * @returns 저장된 메시지 문서 배열.
   */
  createMany(docs: MessageDoc[]): Promise<MessageDoc[]>;

  /**
   * 대화에 속한 모든 메시지를 조회.
   * @param conversationId 대화 ID.
   * @returns 해당 대화의 모든 메시지 문서 배열.
   */
  findAllByConversationId(conversationId: string): Promise<MessageDoc[]>;

  /**
   * 메시지 업데이트.
   * @param id 업데이트할 메시지 ID.
   * @param conversationId 메시지가 속한 대화 ID.
   * @param updates 업데이트할 필드 (Partial Doc).
   * @returns 업데이트된 메시지 문서 또는 null.
   */
  update(id: string, conversationId: string, updates: Partial<MessageDoc>): Promise<MessageDoc | null>;

  /**
   * 메시지 삭제.
   * @param id 삭제할 메시지 ID.
   * @param conversationId 메시지가 속한 대화 ID.
   * @returns 삭제 성공 여부.
   */
  delete(id: string, conversationId: string): Promise<boolean>;

  /**
   * 대화에 속한 모든 메시지를 삭제.
   * @param conversationId 대화 ID.
   * @returns 삭제된 메시지 수.
   */
  deleteAllByConversationId(conversationId: string): Promise<number>;
}
