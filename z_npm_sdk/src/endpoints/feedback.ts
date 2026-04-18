/**
 * @module FeedbackApi (SDK)
 * @description GraphNode SDK — 피드백 API 클라이언트 클래스.
 * `/v1/feedback` 엔드포인트 하위의 모든 API를 호출한다.
 *
 * 주요 기능:
 * - 피드백 제출 (`create`) — 여러 파일 첨부 지원, 인증 불필요
 * - 피드백 목록 조회 (`list`)
 * - 피드백 단건 조회 (`getById`)
 * - 피드백 처리 상태 변경 (`updateStatus`)
 * - 피드백 삭제 (`deleteById`)
 *
 * @public
 */

import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  CreateFeedbackRequestDto,
  CreateFeedbackResponseDto,
  FeedbackResponseDto,
  ListFeedbackResponseDto,
  UpdateFeedbackStatusDto,
} from '../types/feedback.js';

/**
 * 피드백 목록 조회 시 사용하는 쿼리 파라미터 옵션 타입.
 */
export interface ListFeedbackOptions {
  /**
   * @description 한 페이지당 최대 항목 수. 1~100. 기본값 20.
   */
  limit?: number;
  /**
   * @description 다음 페이지 커서. 이전 응답의 `nextCursor` 값을 전달한다. 첫 페이지는 생략.
   */
  cursor?: string;
}

/**
 * 피드백 API 클라이언트 클래스.
 * `client.feedback.*` 형태로 사용한다.
 *
 * @public
 */
export class FeedbackApi {
  constructor(private readonly rb: RequestBuilder) {}

  /**
   * 새 피드백을 서버에 제출한다. 인증 없이 호출 가능하다.
   *
   * @description
   * 사용자가 버그 리포트, 기능 요청, 일반 의견 등을 제출할 때 사용한다.
   * `userName`, `userEmail`은 선택 항목이며 익명 제출도 가능하다.
   *
   * 파일을 첨부하는 경우 `files` 인자에 `File` 배열을 전달한다.
   * 파일이 있으면 내부적으로 `multipart/form-data`로 전환되고,
   * 없으면 `application/json`으로 전송된다 (ai.ts `chat` 메서드와 동일한 방식).
   * 파일은 서버에서 S3 `feedback-files/` 경로에 저장되며,
   * 응답의 `feedback.attachments` 배열에 메타데이터가 포함된다.
   *
   * @param body - 제출할 피드백 데이터
   *   - `category` (string): 카테고리. 1~191자. (예: "BUG", "FEATURE", "UX")
   *   - `title` (string): 제목. 1~1000자.
   *   - `content` (string): 본문. 1~10000자.
   *   - `userName` (string | null, optional): 작성자 이름. 최대 191자.
   *   - `userEmail` (string | null, optional): 작성자 이메일. 유효한 이메일 형식.
   * @param files - (선택) 첨부할 파일 배열. 여러 파일 전달 가능. `files` 필드로 전송된다.
   * @returns 생성된 피드백 데이터 (`{ feedback: FeedbackDto }`)
   *
   * **응답 상태 코드:**
   * - `201 Created`: 피드백 제출 성공
   * - `400 Bad Request`: 필수 필드 누락 또는 형식 오류 (빈 제목, 잘못된 이메일 등)
   * - `502 Bad Gateway`: 서버 DB 저장 또는 S3 업로드 오류
   *
   * @example
   * // 텍스트만 (인증 불필요)
   * const { data } = await client.feedback.create({
   *   category: 'BUG',
   *   title: '로그인 오류',
   *   content: '소셜 로그인 시 500 에러가 발생합니다.',
   *   userName: '홍길동',
   *   userEmail: 'hong@example.com',
   * });
   * console.log(data.feedback.id);          // "uuid-abc"
   * console.log(data.feedback.attachments); // null
   *
   * @example
   * // 파일 첨부 (여러 파일 가능)
   * const screenshotFile = new File([blob], 'screenshot.png', { type: 'image/png' });
   * const logFile = new File([logText], 'error.log', { type: 'text/plain' });
   * const { data } = await client.feedback.create(
   *   { category: 'BUG', title: '스크린샷 첨부', content: '오류 화면입니다.' },
   *   [screenshotFile, logFile]
   * );
   * console.log(data.feedback.attachments);
   * // [
   * //   { url: 'feedback-files/uuid-screenshot.png', name: 'screenshot.png', mimeType: 'image/png', size: 204800 },
   * //   { url: 'feedback-files/uuid-error.log', name: 'error.log', mimeType: 'text/plain', size: 1024 },
   * // ]
   */
  create(
    body: CreateFeedbackRequestDto,
    files?: File[]
  ): Promise<HttpResponse<CreateFeedbackResponseDto>> {
    const rb = this.rb.path('/v1/feedback');

    if (files && files.length > 0) {
      const formData = new FormData();
      Object.entries(body).forEach(([k, v]) => {
        if (v != null) formData.append(k, String(v));
      });
      files.forEach((f) => formData.append('files', f));
      return rb.post<CreateFeedbackResponseDto>(formData);
    }

    return rb.post<CreateFeedbackResponseDto>(body);
  }

  /**
   * 피드백 목록을 커서 기반 페이지네이션으로 조회한다.
   *
   * @description
   * `nextCursor`가 null이 아닌 경우 다음 페이지가 존재한다.
   * 다음 페이지 조회 시 `cursor` 옵션에 `nextCursor` 값을 전달한다.
   *
   * @param options - 목록 조회 옵션
   *   - `limit` (number, optional): 한 페이지 최대 항목 수. 1~100. 기본값 20.
   *   - `cursor` (string, optional): 다음 페이지 커서.
   * @returns 피드백 목록과 다음 페이지 커서 (`{ feedbacks: FeedbackDto[], nextCursor: string | null }`)
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공 (피드백 없으면 빈 배열)
   * - `400 Bad Request`: 쿼리 파라미터 형식 오류 (limit 범위 초과 등)
   * - `502 Bad Gateway`: 서버 DB 조회 오류
   *
   * @example
   * // 첫 페이지 조회
   * const page1 = await client.feedback.list({ limit: 10 });
   *
   * // 다음 페이지 조회
   * if (page1.data.nextCursor) {
   *   const page2 = await client.feedback.list({
   *     limit: 10,
   *     cursor: page1.data.nextCursor,
   *   });
   * }
   */
  list(options: ListFeedbackOptions = {}): Promise<HttpResponse<ListFeedbackResponseDto>> {
    return this.rb
      .path('/v1/feedback')
      .query({ limit: options.limit, cursor: options.cursor })
      .get<ListFeedbackResponseDto>();
  }

  /**
   * 피드백 ID로 단건을 조회한다.
   *
   * @param id - 조회할 피드백 UUID
   * @returns 해당 피드백 데이터 (`{ feedback: FeedbackDto }`)
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공
   * - `404 Not Found`: 해당 ID의 피드백이 존재하지 않음
   * - `502 Bad Gateway`: 서버 DB 조회 오류
   *
   * @example
   * const { data } = await client.feedback.getById('uuid-123');
   * console.log(data.feedback.title);        // "로그인 오류"
   * console.log(data.feedback.attachments);  // 첨부 파일 목록 또는 null
   */
  getById(id: string): Promise<HttpResponse<FeedbackResponseDto>> {
    return this.rb.path(`/v1/feedback/${id}`).get<FeedbackResponseDto>();
  }

  /**
   * 피드백의 처리 상태를 변경한다.
   *
   * @description
   * 피드백 처리 워크플로우: `UNREAD → READ → IN_PROGRESS → DONE`
   * 허용되는 상태값: `"UNREAD"` | `"READ"` | `"IN_PROGRESS"` | `"DONE"`
   *
   * @param id - 상태를 변경할 피드백 UUID
   * @param dto - 상태 변경 요청 데이터
   * @returns 갱신된 피드백 데이터 (`{ feedback: FeedbackDto }`)
   *
   * **응답 상태 코드:**
   * - `200 OK`: 상태 변경 성공
   * - `400 Bad Request`: 허용되지 않는 status 값
   * - `404 Not Found`: 해당 ID의 피드백이 존재하지 않음
   * - `502 Bad Gateway`: 서버 DB 갱신 오류
   *
   * @example
   * await client.feedback.updateStatus('uuid-123', { status: 'READ' });
   */
  updateStatus(id: string, dto: UpdateFeedbackStatusDto): Promise<HttpResponse<FeedbackResponseDto>> {
    return this.rb.path(`/v1/feedback/${id}/status`).patch<FeedbackResponseDto>(dto);
  }

  /**
   * 피드백을 서버에서 영구적으로 삭제한다.
   *
   * @description 삭제된 피드백은 복구할 수 없다.
   *
   * @param id - 삭제할 피드백 UUID
   * @returns void (본문 없음)
   *
   * **응답 상태 코드:**
   * - `204 No Content`: 삭제 성공
   * - `404 Not Found`: 해당 ID의 피드백이 존재하지 않음
   * - `502 Bad Gateway`: 서버 DB 삭제 오류
   *
   * @example
   * await client.feedback.deleteById('uuid-123');
   */
  deleteById(id: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/v1/feedback/${id}`).delete<void>();
  }
}
