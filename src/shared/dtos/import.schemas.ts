import { z } from 'zod';

export const createImportSchema = z.object({
  provider: z.string().min(1),
});

export const importJobIdParamSchema = z.object({
  jobId: z.string().min(1),
});

export const fileAccessQuerySchema = z.object({
  disposition: z.enum(['inline', 'attachment']).optional(),
});
