/**
 * @module FeedbackController
 * @description 피드백 HTTP 요청 핸들러.
 *
 * 책임:
 * - Zod 스키마를 사용한 요청 데이터 검증
 * - multipart/form-data 파일 배열을 FeedbackService에 전달
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
 * 파일 첨부 시 `req.files`(Multer 처리 결과)를 Service에 함께 전달한다.
 */
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * 피드백 생성 핸들러.
   * `POST /v1/feedback`
   *
   * @description
   * 요청 body를 `createFeedbackSchema`로 검증한 뒤 Service의 `createFeedback`을 호출한다.
   * `multipart/form-data`로 전송된 경우 `req.files`에서 Multer 파일 배열을 추출하여 함께 전달한다.
   * 파일 미첨부 시에도 정상 동작한다 (파일은 optional).
   * 인증 없이 호출 가능한 공개 API이다.
   *
   * @param req - `req.body`: { category, userName?, userEmail?, title, content }
   *              `req.files`: Express.Multer.File[] (multipart/form-data 'files' 필드)
   * @param res - 응답 객체
   * @param next - 에러 전달 함수
   * @returns `201 Created`: `{ feedback: FeedbackDto }`
   * @throws {ValidationError} VALIDATION_FAILED — Zod 검증 실패 (400)
   * @throws {UpstreamError} UPSTREAM_ERROR — S3 업로드 또는 DB 저장 실패 (502)
   * @example
   * // JSON 전송 (파일 없음)
   * POST /v1/feedback
   * Content-Type: application/json
   * { "category": "BUG", "title": "로그인 오류", "content": "소셜 로그인 시 500 에러 발생" }
   * → 201 { feedback: { id: "...", attachments: null, ... } }
   *
   * @example
   * // multipart/form-data 전송 (파일 첨부)
   * POST /v1/feedback
   * Content-Type: multipart/form-data
   * fields: category, title, content
   * files: files[] (여러 파일 가능)
   * → 201 { feedback: { id: "...", attachments: [{ url, name, mimeType, size }], ... } }
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = createFeedbackSchema.parse(req.body);
      const files = Array.isArray(req.files)
        ? (req.files as Express.Multer.File[])
        : undefined;
      const feedback = await this.feedbackService.createFeedback(body, files);
      res.status(201).location(`/v1/feedback/${feedback.id}`).json({ feedback });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 피드백 목록 조회 핸들러.
   * `GET /v1/feedback`
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
