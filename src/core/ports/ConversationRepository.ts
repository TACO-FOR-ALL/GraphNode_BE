/**
 * 모듈: ConversationRepository Port
 * 책임
 * - 대화 문서의 CRUD 및 조회를 위한 포트를 정의한다.
 * 외부 의존
 * - 없음.
 */
import type { ConversationDoc } from '../types/persistence/ai.persistence';

/**
 * ConversationRepository Port
 * - 대화 문서의 CRUD 및 조회를 위한 계약을 정의한다.
 * - 구현은 infra 레이어(예: MongoDB)에서 제공한다.
 * - **Rule 1**: Repository는 오직 Persistence Type(`*Doc`)만 다룬다. DTO 변환은 Service/Mapper 책임.
 */
export interface ConversationRepository {
  /**
   * 신규 대화 생성.
   * @param doc 저장할 대화 문서.
   * @returns 저장된 대화 문서.
   */
  create(doc: ConversationDoc): Promise<ConversationDoc>;

  /**
   * ID로 대화 조회.
   * @param id 대화 ID.
   * @param ownerUserId 소유자 ID.
   * @returns 대화 문서 또는 null.
   */
  findById(id: string, ownerUserId: string): Promise<ConversationDoc | null>;

  /**
   * 소유자 기준으로 대화 목록 조회 (페이징).
   * @param ownerUserId 소유자 ID.
   * @param limit 페이지당 항목 수.
   * @param cursor 페이지 커서.
   * @returns 대화 문서 목록과 다음 커서.
   */
  listByOwner(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ConversationDoc[]; nextCursor?: string | null }>;

  /**
   * 대화 업데이트.
   * @param id 업데이트할 대화 ID.
   * @param ownerUserId 소유자 ID.
   * @param updates 업데이트할 필드 (Partial Doc).
   * @returns 업데이트된 대화 문서 또는 null.
   */
  update(id: string, ownerUserId: string, updates: Partial<ConversationDoc>): Promise<ConversationDoc | null>;

  /**
   * 대화 삭제.
   * @param id 삭제할 대화 ID.
   * @param ownerUserId 소유자 ID.
   * @returns 삭제 성공 여부.
   */
  delete(id: string, ownerUserId: string): Promise<boolean>;
}
