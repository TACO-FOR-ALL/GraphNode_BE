/**
 * @module FeedbackController
 * @description 피드백 HTTP 요청 핸들러.
 *
 * 책임:
 * - Zod 스키마를 사용한 요청 데이터 검증
 * - FeedbackService 호출
 * - HTTP 응답 반환 (상태 코드, Location 헤더 등)
 * - 에러는 `next(err)`로 중앙 에러 핸들러에 위임
 *
 * 비즈니스 로직은 포함하지 않는다. ≤ 150 LOC.
 */

import type { NextFunction, Request, Response } from 'express';

import type { FeedbackService } from '../../core/services/FeedbackService';
import {
  createFeedbackSchema,
  updateFeedbackStatusSchema,
  listFeedbackQuerySchema,
} from '../../shared/dtos/feedback.schemas';

/**
 * 피드백 CRUD HTTP 핸들러 클래스.
 *
 * @description
 * 모든 핸들러는 Zod 스키마로 입력을 검증한 뒤 Service 계층에 위임한다.
 * Zod `parse` 실패 시 ZodError가 throw되며, 중앙 에러 미들웨어가 RFC 9457 형식으로 직렬화한다.
 */
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * 피드백 생성 핸들러.
   * `POST /v1/feedback`
   *
   * @description
   * 요청 body를 `createFeedbackSchema`로 검증한 뒤 Service의 `createFeedback`을 호출한다.
   * 성공 시 `201 Created`와 함께 생성된 피드백을 반환하고,
   * `Location` 헤더를 `/v1/feedback/:id`로 설정한다.
   *
   * @param req - `req.body`: { category, userName?, userEmail?, title, content }
   * @param res - 응답 객체
   * @param next - 에러 전달 함수
   * @returns `201 Created`: `{ feedback: FeedbackDto }`
   * @throws {ValidationError} VALIDATION_FAILED — Zod 검증 실패 (400)
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 저장 실패 (502)
   * @example
   * POST /v1/feedback
   * { "category": "BUG", "title": "로그인 오류", "content": "소셜 로그인 시 500 에러 발생" }
   * → 201 { feedback: { id: "...", ... } }
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = createFeedbackSchema.parse(req.body);
      const feedback = await this.feedbackService.createFeedback(body);
      res.status(201).location(`/v1/feedback/${feedback.id}`).json({ feedback });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 피드백 목록 조회 핸들러.
   * `GET /v1/feedback`
   *
   * @description
   * 쿼리 파라미터를 `listFeedbackQuerySchema`로 검증한 뒤 Service의 `listFeedbacks`를 호출한다.
   * 커서 기반 페이지네이션을 지원한다.
   *
   * @param req - `req.query`: { limit?: number, cursor?: string }
   * @param res - 응답 객체
   * @param next - 에러 전달 함수
   * @returns `200 OK`: `{ feedbacks: FeedbackDto[], nextCursor: string | null }`
   * @throws {ValidationError} VALIDATION_FAILED — 쿼리 파라미터 형식 오류 (400)
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 (502)
   * @example
   * GET /v1/feedback?limit=10
   * → 200 { feedbacks: [...], nextCursor: "uuid-abc" }
   * GET /v1/feedback?limit=10&cursor=uuid-abc
   * → 200 { feedbacks: [...], nextCursor: null }
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit, cursor } = listFeedbackQuerySchema.parse(req.query);
      const result = await this.feedbackService.listFeedbacks(limit, cursor);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 피드백 단건 조회 핸들러.
   * `GET /v1/feedback/:id`
   *
   * @description
   * URL 파라미터의 `id`로 피드백 단건을 조회한다.
   *
   * @param req - `req.params.id`: 피드백 UUID
   * @param res - 응답 객체
   * @param next - 에러 전달 함수
   * @returns `200 OK`: `{ feedback: FeedbackDto }`
   * @throws {NotFoundError} NOT_FOUND — 해당 ID의 피드백이 없을 때 (404)
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 (502)
   * @example
   * GET /v1/feedback/uuid-123
   * → 200 { feedback: { id: "uuid-123", ... } }
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const feedback = await this.feedbackService.getFeedback(id);
      res.status(200).json({ feedback });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 피드백 처리 상태 변경 핸들러.
   * `PATCH /v1/feedback/:id/status`
   *
   * @description
   * 요청 body를 `updateFeedbackStatusSchema`로 검증한 뒤 Service의 `updateFeedbackStatus`를 호출한다.
   *
   * @param req - `req.params.id`: 피드백 UUID, `req.body`: { status: FeedbackStatus }
   * @param res - 응답 객체
   * @param next - 에러 전달 함수
   * @returns `200 OK`: `{ feedback: FeedbackDto }`
   * @throws {ValidationError} VALIDATION_FAILED — 유효하지 않은 status 값 (400)
   * @throws {NotFoundError} NOT_FOUND — 해당 ID의 피드백이 없을 때 (404)
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 갱신 실패 (502)
   * @example
   * PATCH /v1/feedback/uuid-123/status
   * { "status": "READ" }
   * → 200 { feedback: { id: "uuid-123", status: "READ", ... } }
   */
  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const body = updateFeedbackStatusSchema.parse(req.body);
      const feedback = await this.feedbackService.updateFeedbackStatus(id, body);
      res.status(200).json({ feedback });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 피드백 삭제 핸들러.
   * `DELETE /v1/feedback/:id`
   *
   * @description
   * URL 파라미터의 `id`로 피드백을 영구 삭제한다.
   * 성공 시 본문 없이 `204 No Content`를 반환한다.
   *
   * @param req - `req.params.id`: 피드백 UUID
   * @param res - 응답 객체
   * @param next - 에러 전달 함수
   * @returns `204 No Content`
   * @throws {NotFoundError} NOT_FOUND — 해당 ID의 피드백이 없을 때 (404)
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 삭제 실패 (502)
   * @example
   * DELETE /v1/feedback/uuid-123
   * → 204 No Content
   */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await this.feedbackService.deleteFeedback(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}
