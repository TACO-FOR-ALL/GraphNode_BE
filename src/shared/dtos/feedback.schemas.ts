/**
 * @module feedback.schemas
 * @description 피드백 API 요청 데이터 검증을 위한 Zod 스키마 모듈.
 * FeedbackController에서 `schema.parse(req.body)` / `schema.parse(req.query)` 형태로 사용된다.
 *
 * Public interface:
 * - {@link createFeedbackSchema} — POST /v1/feedback 요청 body 검증
 * - {@link updateFeedbackStatusSchema} — PATCH /v1/feedback/:id/status 요청 body 검증
 * - {@link listFeedbackQuerySchema} — GET /v1/feedback 쿼리 파라미터 검증
 */

import { z } from 'zod';

import { FEEDBACK_STATUSES } from './feedback';

/**
 * 빈 문자열 또는 공백만 있는 문자열을 null로 변환하는 전처리 함수.
 * Zod `z.preprocess`와 함께 사용하여 선택 필드의 공백 입력을 정규화한다.
 *
 * @param value - 전처리할 입력값
 * @returns 트림 후 빈 문자열이면 null, 그 외에는 원본값 그대로 반환
 * @example
 * emptyStringToNull('  ') // => null
 * emptyStringToNull('hello') // => 'hello'
 * emptyStringToNull(null) // => null
 */
const emptyStringToNull = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * 피드백 생성 요청 body 검증 스키마.
 * `POST /v1/feedback` 엔드포인트에서 사용된다.
 *
 * 검증 규칙:
 * - `category`: 필수. 공백 제거 후 1~191자.
 * - `userName`: 선택. 공백만 있으면 null 처리. 1~191자.
 * - `userEmail`: 선택. 공백만 있으면 null 처리. 유효한 이메일 형식. 최대 191자.
 * - `title`: 필수. 공백 제거 후 1~1000자.
 * - `content`: 필수. 공백 제거 후 1~10000자.
 *
 * @example
 * const parsed = createFeedbackSchema.parse(req.body);
 * // parsed.category, parsed.title, parsed.content 등 트림된 값
 */
export const createFeedbackSchema = z.object({
  category: z.string().trim().min(1, 'category is required').max(191),
  userName: z.preprocess(
    emptyStringToNull,
    z.string().trim().min(1).max(191).nullable().optional()
  ),
  userEmail: z.preprocess(
    emptyStringToNull,
    z.string().trim().email('userEmail must be a valid email').max(191).nullable().optional()
  ),
  title: z.string().trim().min(1, 'title is required').max(1000),
  content: z.string().trim().min(1, 'content is required').max(10000),
});

/** `createFeedbackSchema`로부터 추론된 TypeScript 타입. */
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

/**
 * 피드백 상태 변경 요청 body 검증 스키마.
 * `PATCH /v1/feedback/:id/status` 엔드포인트에서 사용된다.
 *
 * 검증 규칙:
 * - `status`: 필수. "UNREAD" | "READ" | "IN_PROGRESS" | "DONE" 중 하나.
 *
 * @example
 * const { status } = updateFeedbackStatusSchema.parse(req.body);
 */
export const updateFeedbackStatusSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES, {
    error: `status must be one of: ${FEEDBACK_STATUSES.join(', ')}`,
  }),
});

/** `updateFeedbackStatusSchema`로부터 추론된 TypeScript 타입. */
export type UpdateFeedbackStatusInput = z.infer<typeof updateFeedbackStatusSchema>;

/**
 * 피드백 목록 조회 쿼리 파라미터 검증 스키마.
 * `GET /v1/feedback` 엔드포인트에서 사용된다.
 *
 * 검증 규칙:
 * - `limit`: 선택. 1~100 정수. 기본값 20.
 * - `cursor`: 선택. 다음 페이지 커서 (이전 응답의 `nextCursor` 값).
 *
 * @example
 * const { limit, cursor } = listFeedbackQuerySchema.parse(req.query);
 */
export const listFeedbackQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

/** `listFeedbackQuerySchema`로부터 추론된 TypeScript 타입. */
export type ListFeedbackQueryInput = z.infer<typeof listFeedbackQuerySchema>;
