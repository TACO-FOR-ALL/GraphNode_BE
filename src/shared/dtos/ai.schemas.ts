import { z } from 'zod';

/**
 * Zod schemas for AI endpoints. These live alongside DTO types in src/shared/dtos.
 * Controllers should import these schemas and types and let errors bubble to central handler.
 */

export const createConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1),
        ts: z.string().datetime().optional(),
      })
    )
    .optional(),
});

export const bulkCreateConversationsSchema = z.object({
  conversations: z.array(createConversationSchema),
});

export const updateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const createMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  ts: z.string().datetime().optional(),
});

export const updateMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']).optional(),
  content: z.string().min(1).optional(),
});

export type CreateConversationRequest = z.infer<typeof createConversationSchema>;
export type UpdateConversationRequest = z.infer<typeof updateConversationSchema>;
export type BulkCreateConversationsRequest = z.infer<
  typeof bulkCreateConversationsSchema
>;
export type CreateMessageRequest = z.infer<typeof createMessageSchema>;
export type UpdateMessageRequest = z.infer<typeof updateMessageSchema>;
