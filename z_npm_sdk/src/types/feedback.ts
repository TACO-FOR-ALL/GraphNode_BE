/**
 * @module feedback (SDK Types)
 * @description GraphNode SDK — 피드백 API 요청/응답 타입 정의.
 * `client.feedback.*` 메서드의 인자 및 반환값 타입으로 사용된다.
 *
 * Public interface:
 * - {@link CreateFeedbackRequestDto} — 피드백 생성 요청 타입
 * - {@link UpdateFeedbackStatusDto} — 피드백 상태 변경 요청 타입
 * - {@link FeedbackDto} — 피드백 단건 응답 타입
 * - {@link CreateFeedbackResponseDto} — 피드백 생성 응답 Wrapper
 * - {@link ListFeedbackResponseDto} — 피드백 목록 응답 타입
 */

/**
 * 피드백 생성 요청 타입.
 * `client.feedback.create(dto)` 메서드의 인자 타입.
 *
 * @example
 * const dto: CreateFeedbackRequestDto = {
 *   category: 'BUG',
 *   title: '로그인 오류',
 *   content: '소셜 로그인 시 500 에러가 발생합니다.',
 *   userName: '홍길동',
 *   userEmail: 'hong@example.com',
 * };
 */
export interface CreateFeedbackRequestDto {
  /**
   * @description 피드백 분류 카테고리. 1~191자. (예: "BUG", "FEATURE", "UX", "OTHER")
   */
  category: string;
  /**
   * @description 피드백 작성자 이름. 선택 입력. 최대 191자.
   */
  userName?: string | null;
  /**
   * @description 피드백 작성자 이메일. 선택 입력. 유효한 이메일 형식 필요. 최대 191자.
   */
  userEmail?: string | null;
  /**
   * @description 피드백 제목. 1~1000자.
   */
  title: string;
  /**
   * @description 피드백 본문 내용. 1~10000자.
   */
  content: string;
}

/**
 * 피드백 상태 변경 요청 타입.
 * `client.feedback.updateStatus(id, dto)` 메서드의 인자 타입.
 *
 * @example
 * await client.feedback.updateStatus('uuid-123', { status: 'READ' });
 */
export interface UpdateFeedbackStatusDto {
  /**
   * @description 변경할 피드백 처리 상태.
   * 허용값: "UNREAD" | "READ" | "IN_PROGRESS" | "DONE"
   */
  status: 'UNREAD' | 'READ' | 'IN_PROGRESS' | 'DONE';
}

/**
 * 피드백 단건 응답 타입.
 * 피드백 생성·조회·상태 변경 응답의 `feedback` 필드 타입.
 *
 * @example
 * const { data } = await client.feedback.getById('uuid-123');
 * console.log(data.feedback.status); // "UNREAD"
 */
export interface FeedbackDto {
  /** @description 피드백 고유 식별자. UUID v4 형식. */
  id: string;
  /** @description 피드백 카테고리. */
  category: string;
  /** @description 작성자 이름. 없으면 null. */
  userName: string | null;
  /** @description 작성자 이메일. 없으면 null. */
  userEmail: string | null;
  /** @description 피드백 제목. */
  title: string;
  /** @description 피드백 본문. */
  content: string;
  /** @description 현재 처리 상태. "UNREAD" | "READ" | "IN_PROGRESS" | "DONE" */
  status: string;
  /** @description 생성 일시. ISO 8601 형식 (예: "2024-03-12T10:00:00.000Z"). */
  createdAt: string;
  /** @description 최종 수정 일시. ISO 8601 형식. */
  updatedAt: string;
}

/**
 * 피드백 생성(`POST /v1/feedback`) 응답 타입.
 * `client.feedback.create()` 메서드의 반환 데이터 타입.
 */
export interface CreateFeedbackResponseDto {
  /** @description 생성된 피드백 데이터. */
  feedback: FeedbackDto;
}

/**
 * 피드백 단건 조회(`GET /v1/feedback/:id`) 및 상태 변경 응답 타입.
 */
export interface FeedbackResponseDto {
  /** @description 조회되거나 갱신된 피드백 데이터. */
  feedback: FeedbackDto;
}

/**
 * 피드백 목록 조회(`GET /v1/feedback`) 응답 타입.
 * 커서 기반 페이지네이션을 사용한다.
 *
 * @example
 * const { data } = await client.feedback.list({ limit: 10 });
 * console.log(data.feedbacks.length);   // 최대 10개
 * console.log(data.nextCursor);         // 다음 페이지 커서 또는 null
 */
export interface ListFeedbackResponseDto {
  /** @description 현재 페이지의 피드백 목록. */
  feedbacks: FeedbackDto[];
  /**
   * @description 다음 페이지 조회용 커서. 마지막 페이지이면 null.
   * 다음 요청의 `cursor` 파라미터로 사용한다.
   */
  nextCursor: string | null;
}
