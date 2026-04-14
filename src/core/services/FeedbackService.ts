import { FeedbackRepository } from '../ports/FeedbackRepository';
import {
  CreateFeedbackRequestDto,
  DEFAULT_FEEDBACK_STATUS,
  type FeedbackDto,
} from '../../shared/dtos/feedback';
import { UpstreamError, ValidationError } from '../../shared/errors/domain';
import { FeedbackRecord } from '../types/persistence/feedback.persistence';

export class FeedbackService {
  constructor(private readonly feedbackRepository: FeedbackRepository) {}

  /**
   * 사용자 피드백을 DB에 저장 생성하는 메서드
   * @param feedback
   * @returns
   */
  async createFeedback(feedback: CreateFeedbackRequestDto): Promise<FeedbackDto> {
    try {
      const created: FeedbackRecord = await this.feedbackRepository.create(feedbackRecord);
      return {
        id: created.id,
        category: created.category,
        userName: created.userName,
        userEmail: created.userEmail,
        title: created.title,
        content: created.content,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') {
        throw err;
      }
      throw new UpstreamError('Failed to create feedback', { cause: err as any });
    }
  }

  /**
   *
   * @param value
   * @param field
   * @param max
   * @returns
   */
  private requireTrimmed(value: string, field: string, max: number): string {
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
   *
   * @param value
   * @param field
   * @param max
   * @returns
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
