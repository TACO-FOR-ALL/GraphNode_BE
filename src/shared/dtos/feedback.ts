/**
 * @module feedback (DTO)
 * @description 피드백 API 요청/응답 데이터 전송 객체(DTO) 정의 모듈.
 * Presentation ↔ Core 계층 경계에서 사용되며, DB 레코드 타입과 분리된다.
 *
 * Public interface:
 * - {@link FeedbackAttachmentDto} — 첨부 파일 메타데이터 DTO
 * - {@link CreateFeedbackRequestDto} — 피드백 생성 요청 DTO
 * - {@link UpdateFeedbackStatusDto} — 피드백 상태 변경 요청 DTO
 * - {@link FeedbackDto} — 피드백 응답 DTO (단건)
 * - {@link CreateFeedbackResponseDto} — 피드백 생성 응답 Wrapper
 * - {@link ListFeedbackResponseDto} — 피드백 목록 응답 DTO
 */

/**
 * 피드백 처리 상태의 초기값.
 * 새로 제출된 피드백은 항상 `UNREAD` 상태로 저장된다.
 */
export const DEFAULT_FEEDBACK_STATUS = 'UNREAD' as const;

/**
 * 피드백 처리 상태 열거값.
 * DB `status` 컬럼에 저장되는 허용값 집합.
 */
export const FEEDBACK_STATUSES = ['UNREAD', 'READ', 'IN_PROGRESS', 'DONE'] as const;

/** 피드백 처리 상태 유니온 타입. */
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * 첨부 파일 1개의 메타데이터 응답 DTO.
 * `FeedbackDto.attachments` 배열의 요소 타입으로 사용된다.
 */
export interface FeedbackAttachmentDto {
  /** @description S3 file bucket 객체 키. 다운로드 시 사용. 예: "feedback-files/uuid-report.pdf" */
  url: string;
  /** @description 원본 파일명. 예: "report.pdf" */
  name: string;
  /** @description MIME 타입. 예: "application/pdf", "image/png" */
  mimeType: string;
  /** @description 파일 크기 (bytes). */
  size: number;
}

/**
 * 피드백 생성 요청 DTO.
 * `POST /v1/feedback` 요청 body에 대응한다.
 * 파일 첨부 시에는 `multipart/form-data`로 전송하며, 파일은 `files` 필드로 전달한다.
 */
export interface CreateFeedbackRequestDto {
  /**
   * @description 피드백 분류 카테고리. 1~191자. (예: "BUG", "FEATURE", "UX", "OTHER")
   */
  category: string;
  /**
   * @description 피드백 작성자 이름. 선택 입력. 공백만 있을 경우 null로 처리. 최대 191자.
   */
  userName?: string | null;
  /**
   * @description 피드백 작성자 이메일 주소. 선택 입력. 유효한 이메일 형식 필수. 최대 191자.
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
 * 피드백 상태 변경 요청 DTO.
 * `PATCH /v1/feedback/:id/status` 요청 body에 대응한다.
 */
export interface UpdateFeedbackStatusDto {
  /**
   * @description 변경할 피드백 상태. 허용값: "UNREAD" | "READ" | "IN_PROGRESS" | "DONE"
   */
  status: FeedbackStatus;
}

/**
 * 피드백 단건 응답 DTO.
 * DB 레코드에서 클라이언트로 반환되는 표현형으로, 날짜는 ISO 8601 문자열로 직렬화된다.
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
  /** @description 현재 처리 상태. */
  status: string;
  /**
   * @description 첨부 파일 목록. 파일이 없으면 null.
   * 각 항목에 S3 키(`url`), 원본 파일명(`name`), MIME 타입(`mimeType`), 크기(`size`)가 포함된다.
   */
  attachments: FeedbackAttachmentDto[] | null;
  /** @description 생성 일시. ISO 8601 형식 (예: "2024-03-12T10:00:00.000Z"). */
  createdAt: string;
  /** @description 최종 수정 일시. ISO 8601 형식. */
  updatedAt: string;
}

/**
 * 피드백 생성(`POST /v1/feedback`) 응답 DTO.
 */
export interface CreateFeedbackResponseDto {
  /** @description 생성된 피드백 데이터. */
  feedback: FeedbackDto;
}

/**
 * 피드백 목록 조회(`GET /v1/feedback`) 응답 DTO.
 * 커서 기반 페이지네이션을 사용한다.
 */
export interface ListFeedbackResponseDto {
  /** @description 현재 페이지의 피드백 목록. */
  feedbacks: FeedbackDto[];
  /**
   * @description 다음 페이지 조회를 위한 커서. 마지막 페이지이면 null.
   * 다음 요청의 `cursor` 쿼리 파라미터로 전달한다.
   */
  nextCursor: string | null;
}
