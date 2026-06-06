import { z } from 'zod';

export const initImportUploadSchema = z.object({
  provider: z.string().min(1),
  originalName: z.string().min(1).default('export.zip'),
  sizeBytes: z.coerce.number().int().positive(),
});

export const importJobIdParamSchema = z.object({
  jobId: z.string().min(1),
});

export const fileAccessQuerySchema = z.object({
  disposition: z.enum(['inline', 'attachment']).optional(),
});
