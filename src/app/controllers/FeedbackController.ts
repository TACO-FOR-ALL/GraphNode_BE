import type { NextFunction, Request, Response } from 'express';

import type { FeedbackService } from '../../core/services/FeedbackService';
import type { CreateFeedbackResponseDto } from '../../shared/dtos/feedback';

export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * POST /
   * 사용자 피드백을 DB에 저장합니다
   * @param req
   * @param res
   * @param next
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. 요청 Body 검증 및 파싱 (Zod 스키마 사용)

      res.status(201).location(`/v1/feedback/${feedback.id}`).json(body);
    } catch (err) {
      next(err);
    }
  }
}
