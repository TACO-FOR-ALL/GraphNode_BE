/**
 * @module feedback.persistence
 * @description 사용자 피드백 DB 레코드 타입 정의 모듈.
 * Prisma `Feedback` 모델과 1:1 대응하며, Core 계층의 도메인 타입으로 사용된다.
 *
 * Public interface:
 * - {@link FeedbackRecord} — DB에서 조회한 완전한 피드백 레코드
 * - {@link CreateFeedbackRecord} — DB 저장 시 사용하는 입력 타입 (id/createdAt/updatedAt 제외)
 */

/**
 * DB에 저장된 피드백 레코드의 완전한 표현.
 * Prisma `Feedback` 모델의 필드와 1:1 대응한다.
 *
 * @description
 * - `id`는 PostgreSQL에서 UUID로 자동 생성된다 (`@default(uuid())`).
 * - `createdAt`, `updatedAt`은 DB에서 자동 관리된다.
 */
export interface FeedbackRecord {
  /** @description 피드백 고유 식별자. UUID v4 형식. DB 자동 생성. */
  id: string;
  /** @description 피드백 분류 카테고리. 최대 191자. (예: "BUG", "FEATURE", "OTHER") */
  category: string;
  /** @description 피드백 작성자 이름. 익명 제출 시 null. 최대 191자. */
  userName: string | null;
  /** @description 피드백 작성자 이메일 주소. 익명 제출 시 null. 최대 191자. */
  userEmail: string | null;
  /** @description 피드백 제목. 최소 1자, 최대 1000자. */
  title: string;
  /** @description 피드백 본문 내용. 최소 1자, 최대 10000자. */
  content: string;
  /**
   * @description 피드백 처리 상태.
   * 허용값: "UNREAD" | "READ" | "IN_PROGRESS" | "DONE". 최대 32자.
   */
  status: string;
  /** @description 레코드 생성 시각. DB 자동 설정. */
  createdAt: Date;
  /** @description 레코드 최종 수정 시각. DB 자동 갱신 (`@updatedAt`). */
  updatedAt: Date;
}

/**
 * 피드백 신규 생성 시 저장소에 전달하는 입력 타입.
 * `id`, `createdAt`, `updatedAt`은 DB가 자동 생성하므로 제외된다.
 *
 * @description Repository의 `create` 메서드 인자로 사용된다.
 */
export type CreateFeedbackRecord = Omit<FeedbackRecord, 'id' | 'createdAt' | 'updatedAt'>;
