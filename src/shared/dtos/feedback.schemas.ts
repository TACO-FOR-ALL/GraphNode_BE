import { z } from 'zod';

/**
 *
 * @param value
 * @returns
 */
const emptyStringToNull = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 *
 */
export const createFeedbackSchema = z.object({
  category: z.string().trim().min(1).max(191),
  userName: z.preprocess(
    emptyStringToNull,
    z.string().trim().min(1).max(191).nullable().optional()
  ),
  userEmail: z.preprocess(
    emptyStringToNull,
    z.string().trim().email().max(191).nullable().optional()
  ),
  title: z.string().trim().min(1).max(1000),
  content: z.string().trim().min(1).max(10000),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
