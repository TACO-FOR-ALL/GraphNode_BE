/**
 * @module FeedbackService
 * @description 사용자 피드백 도메인 로직 서비스.
 * Repository Port를 통해서만 인프라에 접근하며, Express 등 프레임워크에 의존하지 않는다.
 * 파일 첨부 시 StoragePort(S3)를 통해 업로드하고 메타데이터를 DB에 저장한다.
 *
 * Public interface:
 * - {@link FeedbackService.createFeedback} — 피드백 생성 (선택적 파일 첨부 지원)
 * - {@link FeedbackService.getFeedback} — 피드백 단건 조회
 * - {@link FeedbackService.listFeedbacks} — 피드백 목록 조회 (커서 페이지네이션)
 * - {@link FeedbackService.updateFeedbackStatus} — 피드백 처리 상태 변경
 * - {@link FeedbackService.deleteFeedback} — 피드백 삭제
 */

import { v4 as uuidv4 } from 'uuid';

import type { FeedbackRepository } from '../ports/FeedbackRepository';
import type { StoragePort } from '../ports/StoragePort';
import type {
  CreateFeedbackRecord,
  FeedbackAttachmentItem,
} from '../types/persistence/feedback.persistence';
import {
  DEFAULT_FEEDBACK_STATUS,
  FEEDBACK_STATUSES,
  type CreateFeedbackRequestDto,
  type FeedbackAttachmentDto,
  type FeedbackDto,
  type ListFeedbackResponseDto,
  type UpdateFeedbackStatusDto,
} from '../../shared/dtos/feedback';
import { NotFoundError, UpstreamError, ValidationError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

/**
 * 피드백 도메인 서비스.
 * 입력 정규화·검증 후 Repository에 위임하고, DB 레코드를 응답 DTO로 변환한다.
 * 파일 첨부 시 S3에 업로드하고 메타데이터를 DB에 저장한다.
 */
export class FeedbackService {
  constructor(
    private readonly feedbackRepository: FeedbackRepository,
    private readonly storageAdapter?: StoragePort
  ) {}

  /**
   * 새 피드백을 생성하여 DB에 저장하고 응답 DTO를 반환한다.
   * 파일이 전달된 경우 S3에 업로드한 뒤 메타데이터를 `attachments` 필드에 저장한다.
   *
   * @description
   * 입력값을 정규화(trim, null 변환)한 뒤 `CreateFeedbackRecord`를 구성하여
   * Repository의 `create`를 호출한다. `id`, `createdAt`, `updatedAt`은 DB가 자동 생성한다.
   * 파일 업로드 실패 시 전체 생성이 중단된다(원자성 보장).
   *
   * @param dto - 피드백 생성 요청 DTO
   *   - `category` (string): 카테고리. 1~191자.
   *   - `userName` (string | null | undefined): 작성자 이름. 선택.
   *   - `userEmail` (string | null | undefined): 작성자 이메일. 선택.
   *   - `title` (string): 제목. 1~1000자.
   *   - `content` (string): 본문. 1~10000자.
   * @param files - (선택) 첨부할 파일 배열. Express Multer의 메모리 버퍼 파일.
   *   파일당 S3 `feedback-files/{uuid}-{originalname}` 경로에 저장된다.
   * @returns 생성된 피드백의 응답 DTO. 불변 객체.
   * @throws {ValidationError} VALIDATION_FAILED — 필드 길이/형식 위반 시
   * @throws {UpstreamError} UPSTREAM_ERROR — S3 업로드 또는 DB 저장 실패 시
   * @example
   * // 텍스트만
   * const feedback = await feedbackService.createFeedback({
   *   category: 'BUG',
   *   title: '로그인 오류',
   *   content: '소셜 로그인 시 500 에러가 발생합니다.',
   * });
   *
   * @example
   * // 파일 첨부
   * const feedback = await feedbackService.createFeedback(
   *   { category: 'BUG', title: '스크린샷 첨부', content: '오류 화면입니다.' },
   *   req.files as Express.Multer.File[]
   * );
   */
  async createFeedback(
    dto: CreateFeedbackRequestDto,
    files?: Express.Multer.File[]
  ): Promise<FeedbackDto> {
    const attachments = await this.uploadFiles(files);

    const record: CreateFeedbackRecord = {
      category: this.requireTrimmed(dto.category, 'category', 191),
      userName: this.normalizeOptional(dto.userName, 'userName', 191),
      userEmail: this.normalizeOptional(dto.userEmail, 'userEmail', 191),
      title: this.requireTrimmed(dto.title, 'title', 1000),
      content: this.requireTrimmed(dto.content, 'content', 10000),
      status: DEFAULT_FEEDBACK_STATUS,
      attachments,
    };

    try {
      const created = await this.feedbackRepository.create(record);
      return this.toDto(created);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code) throw err;
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
      throw new ValidationError(`status must be one of: ${FEEDBACK_STATUSES.join(', ')}`);
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
   * 멀티파트 파일 배열을 S3에 업로드하고 첨부 메타데이터 배열을 반환한다.
   * 파일이 없으면 null을 반환한다. storageAdapter가 주입되지 않은 경우 UpstreamError를 throw한다.
   *
   * @description S3 키 형식: `feedback-files/{uuid}-{YYYYMMDD}{ext}`
   * @param files - Express Multer 메모리 버퍼 파일 배열. undefined 또는 빈 배열이면 null 반환.
   * @returns 업로드된 파일의 메타데이터 배열, 파일이 없으면 null.
   * @throws {UpstreamError} UPSTREAM_ERROR — storageAdapter 미주입 또는 S3 업로드 실패 시
   */
  private async uploadFiles(
    files?: Express.Multer.File[]
  ): Promise<FeedbackAttachmentItem[] | null> {
    if (!files || files.length === 0) return null;

    if (!this.storageAdapter) {
      throw new UpstreamError('Storage adapter not configured for file upload');
    }

    const results: FeedbackAttachmentItem[] = [];
    for (const file of files) {
      const ext = file.originalname.includes('.') ? '.' + file.originalname.split('.').pop() : '';
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const key = `feedback-files/${uuidv4()}-${date}${ext}`;
      try {
        await this.storageAdapter.upload(key, file.buffer, file.mimetype, { bucketType: 'file' });
      } catch (err) {
        logger.error({ err, key }, 'Failed to upload feedback attachment to S3');
        throw new UpstreamError('Failed to upload feedback attachment', { cause: err as Error });
      }
      results.push({
        url: key,
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });
    }
    return results;
  }

  /**
   * DB 레코드를 응답 DTO로 변환한다.
   *
   * @param record - DB에서 조회한 FeedbackRecord
   * @returns 클라이언트로 반환할 FeedbackDto. 날짜는 ISO 8601 문자열로 변환.
   */
  private toDto(record: {
    id: string;
    category: string;
    userName: string | null;
    userEmail: string | null;
    title: string;
    content: string;
    status: string;
    attachments: FeedbackAttachmentItem[] | null;
    createdAt: Date;
    updatedAt: Date;
  }): FeedbackDto {
    const attachments: FeedbackAttachmentDto[] | null = record.attachments
      ? record.attachments.map((a) => ({
          url: a.url,
          name: a.name,
          mimeType: a.mimeType,
          size: a.size,
        }))
      : null;

    return {
      id: record.id,
      category: record.category,
      userName: record.userName,
      userEmail: record.userEmail,
      title: record.title,
      content: record.content,
      status: record.status,
      attachments,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * 문자열 필드를 트림하고 필수값 유효성을 검증한다.
   *
   * @param value - 검증할 입력값
   * @param field - 에러 메시지에 포함할 필드명
   * @param max - 허용 최대 문자 수 (포함)
   * @returns 트림된 문자열
   * @throws {ValidationError} VALIDATION_FAILED — 타입 오류, 빈 값, 길이 초과 시
   * @example
   * const title = this.requireTrimmed(dto.title, 'title', 1000);
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
   * @param value - 정규화할 입력값
   * @param field - 에러 메시지에 포함할 필드명
   * @param max - 허용 최대 문자 수 (포함)
   * @returns 트림된 문자열 또는 null
   * @throws {ValidationError} VALIDATION_FAILED — 타입 오류, 길이 초과 시
   * @example
   * this.normalizeOptional('  ', 'userName', 191) // => null
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
