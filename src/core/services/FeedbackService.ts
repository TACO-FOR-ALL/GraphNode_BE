/**
 * @module FeedbackService
 * @description 사용자 피드백 도메인 로직 서비스.
 * Repository Port를 통해서만 인프라에 접근하며, Express 등 프레임워크에 의존하지 않는다.
 *
 * Public interface:
 * - {@link FeedbackService.createFeedback} — 피드백 생성
 * - {@link FeedbackService.getFeedback} — 피드백 단건 조회
 * - {@link FeedbackService.listFeedbacks} — 피드백 목록 조회 (커서 페이지네이션)
 * - {@link FeedbackService.updateFeedbackStatus} — 피드백 처리 상태 변경
 * - {@link FeedbackService.deleteFeedback} — 피드백 삭제
 */

import type { FeedbackRepository } from '../ports/FeedbackRepository';
import type { CreateFeedbackRecord } from '../types/persistence/feedback.persistence';
import {
  DEFAULT_FEEDBACK_STATUS,
  FEEDBACK_STATUSES,
  type CreateFeedbackRequestDto,
  type FeedbackDto,
  type ListFeedbackResponseDto,
  type UpdateFeedbackStatusDto,
} from '../../shared/dtos/feedback';
import { NotFoundError, UpstreamError, ValidationError } from '../../shared/errors/domain';

/**
 * 피드백 도메인 서비스.
 * 입력 정규화·검증 후 Repository에 위임하고, DB 레코드를 응답 DTO로 변환한다.
 */
export class FeedbackService {
  constructor(private readonly feedbackRepository: FeedbackRepository) {}

  /**
   * 새 피드백을 생성하여 DB에 저장하고 응답 DTO를 반환한다.
   *
   * @description
   * 입력값을 정규화(trim, null 변환)한 뒤 `CreateFeedbackRecord`를 구성하여
   * Repository의 `create`를 호출한다. `id`, `createdAt`, `updatedAt`은 DB가 자동 생성한다.
   *
   * @param dto - 피드백 생성 요청 DTO
   *   - `category` (string): 카테고리. 1~191자.
   *   - `userName` (string | null | undefined): 작성자 이름. 선택.
   *   - `userEmail` (string | null | undefined): 작성자 이메일. 선택.
   *   - `title` (string): 제목. 1~1000자.
   *   - `content` (string): 본문. 1~10000자.
   * @returns 생성된 피드백의 응답 DTO. 불변 객체.
   * @throws {ValidationError} VALIDATION_FAILED — 필드 길이/형식 위반 시
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 저장 실패 시
   * @example
   * const feedback = await feedbackService.createFeedback({
   *   category: 'BUG',
   *   title: '로그인 오류',
   *   content: '소셜 로그인 시 500 에러가 발생합니다.',
   * });
   */
  async createFeedback(dto: CreateFeedbackRequestDto): Promise<FeedbackDto> {
    const record: CreateFeedbackRecord = {
      category: this.requireTrimmed(dto.category, 'category', 191),
      userName: this.normalizeOptional(dto.userName, 'userName', 191),
      userEmail: this.normalizeOptional(dto.userEmail, 'userEmail', 191),
      title: this.requireTrimmed(dto.title, 'title', 1000),
      content: this.requireTrimmed(dto.content, 'content', 10000),
      status: DEFAULT_FEEDBACK_STATUS,
    };

    try {
      const created = await this.feedbackRepository.create(record);
      return this.toDto(created);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code) throw err; // 도메인 에러는 그대로 전파
      throw new UpstreamError('Failed to create feedback', { cause: err as Error });
    }
  }

  /**
   * 피드백 ID로 단건을 조회하여 응답 DTO를 반환한다.
   *
   * @param id - 조회할 피드백 ID (UUID)
   * @returns 해당 피드백의 응답 DTO. 불변 객체.
   * @throws {NotFoundError} NOT_FOUND — 해당 ID의 피드백이 존재하지 않을 때
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 시
   * @example
   * const feedback = await feedbackService.getFeedback('uuid-123');
   */
  async getFeedback(id: string): Promise<FeedbackDto> {
    try {
      const record = await this.feedbackRepository.findById(id);
      if (!record) throw new NotFoundError(`Feedback not found: ${id}`);
      return this.toDto(record);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code) throw err;
      throw new UpstreamError('Failed to get feedback', { cause: err as Error });
    }
  }

  /**
   * 커서 기반 페이지네이션으로 피드백 목록을 조회한다.
   * 결과는 생성 일시 내림차순으로 정렬된다.
   *
   * @param limit - 한 페이지당 최대 항목 수. 1~100. 기본값 20.
   * @param cursor - 다음 페이지 시작 커서 (이전 응답의 `nextCursor`). 첫 페이지는 undefined.
   * @returns 피드백 목록과 다음 페이지 커서를 담은 응답 DTO.
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 시
   * @example
   * const page1 = await feedbackService.listFeedbacks(20);
   * const page2 = await feedbackService.listFeedbacks(20, page1.nextCursor ?? undefined);
   */
  async listFeedbacks(limit = 20, cursor?: string): Promise<ListFeedbackResponseDto> {
    try {
      const { items, nextCursor } = await this.feedbackRepository.findAll(limit, cursor);
      return {
        feedbacks: items.map((r) => this.toDto(r)),
        nextCursor,
      };
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code) throw err;
      throw new UpstreamError('Failed to list feedbacks', { cause: err as Error });
    }
  }

  /**
   * 피드백의 처리 상태를 변경하고 갱신된 응답 DTO를 반환한다.
   *
   * @param id - 상태를 변경할 피드백 ID (UUID)
   * @param dto - 상태 변경 요청 DTO
   *   - `status` (string): 허용값 "UNREAD" | "READ" | "IN_PROGRESS" | "DONE"
   * @returns 갱신된 피드백의 응답 DTO. 불변 객체.
   * @throws {ValidationError} VALIDATION_FAILED — 유효하지 않은 상태값 전달 시
   * @throws {NotFoundError} NOT_FOUND — 해당 ID의 피드백이 존재하지 않을 때
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 갱신 실패 시
   * @example
   * const updated = await feedbackService.updateFeedbackStatus('uuid-123', { status: 'READ' });
   */
  async updateFeedbackStatus(id: string, dto: UpdateFeedbackStatusDto): Promise<FeedbackDto> {
    if (!(FEEDBACK_STATUSES as readonly string[]).includes(dto.status)) {
      throw new ValidationError(
        `status must be one of: ${FEEDBACK_STATUSES.join(', ')}`
      );
    }

    try {
      const updated = await this.feedbackRepository.updateStatus(id, dto.status);
      return this.toDto(updated);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code) throw err;
      throw new UpstreamError('Failed to update feedback status', { cause: err as Error });
    }
  }

  /**
   * 피드백을 DB에서 영구적으로 삭제한다.
   *
   * @param id - 삭제할 피드백 ID (UUID)
   * @returns void
   * @throws {NotFoundError} NOT_FOUND — 해당 ID의 피드백이 존재하지 않을 때
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 삭제 실패 시
   * @example
   * await feedbackService.deleteFeedback('uuid-123');
   */
  async deleteFeedback(id: string): Promise<void> {
    try {
      await this.feedbackRepository.deleteById(id);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code) throw err;
      throw new UpstreamError('Failed to delete feedback', { cause: err as Error });
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * DB 레코드를 응답 DTO로 변환한다.
   *
   * @param record - DB에서 조회한 FeedbackRecord
   * @returns 클라이언트로 반환할 FeedbackDto. 날짜는 ISO 8601 문자열로 변환.
   * @returns 불변 객체
   */
  private toDto(record: {
    id: string;
    category: string;
    userName: string | null;
    userEmail: string | null;
    title: string;
    content: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): FeedbackDto {
    return {
      id: record.id,
      category: record.category,
      userName: record.userName,
      userEmail: record.userEmail,
      title: record.title,
      content: record.content,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * 문자열 필드를 트림하고 필수값 유효성을 검증한다.
   *
   * @description
   * - 타입이 string이 아니면 ValidationError 발생
   * - 트림 후 빈 문자열이면 ValidationError 발생
   * - 최대 길이 초과 시 ValidationError 발생
   *
   * @param value - 검증할 입력값
   * @param field - 에러 메시지에 포함할 필드명
   * @param max - 허용 최대 문자 수 (포함)
   * @returns 트림된 문자열
   * @throws {ValidationError} VALIDATION_FAILED — 타입 오류, 빈 값, 길이 초과 시
   * @example
   * const title = this.requireTrimmed(dto.title, 'title', 1000); // '  hello  ' → 'hello'
   */
  private requireTrimmed(value: unknown, field: string, max: number): string {
    if (typeof value !== 'string') {
      throw new ValidationError(`${field} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new ValidationError(`${field} is required`);
    }
    if (trimmed.length > max) {
      throw new ValidationError(`${field} must be at most ${max} characters`);
    }
    return trimmed;
  }

  /**
   * 선택 문자열 필드를 정규화한다. null/undefined 또는 공백만 있는 경우 null을 반환한다.
   *
   * @description
   * - null 또는 undefined → null 반환
   * - string이 아닌 타입 → ValidationError 발생
   * - 트림 후 빈 문자열 → null 반환
   * - 최대 길이 초과 → ValidationError 발생
   *
   * @param value - 정규화할 입력값
   * @param field - 에러 메시지에 포함할 필드명
   * @param max - 허용 최대 문자 수 (포함)
   * @returns 트림된 문자열 또는 null
   * @throws {ValidationError} VALIDATION_FAILED — 타입 오류, 길이 초과 시
   * @example
   * this.normalizeOptional('  ', 'userName', 191) // => null
   * this.normalizeOptional('홍길동', 'userName', 191) // => '홍길동'
   * this.normalizeOptional(null, 'userName', 191) // => null
   */
  private normalizeOptional(
    value: string | null | undefined,
    field: string,
    max: number
  ): string | null {
    if (value == null) return null;
    if (typeof value !== 'string') {
      throw new ValidationError(`${field} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > max) {
      throw new ValidationError(`${field} must be at most ${max} characters`);
    }
    return trimmed;
  }
}
