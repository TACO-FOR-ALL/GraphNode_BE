import { z } from 'zod';

export const scopeDataTypeSchema = z.enum(['chat', 'file', 'notion', 'note']);
export const scopeCreatedPeriodSchema = z.enum(['1w', '1m', '3m', '1y']);

export const scopeFilterSchema = z
  .discriminatedUnion('mode', [
    z.object({
      mode: z.literal('auto'),
      intent: z.string().min(1, 'AUTO 모드에서는 intent가 필요합니다').max(500),
      filters: z.undefined().optional(),
    }),
    z.object({
      mode: z.literal('manual'),
      filters: z.object({
        dataTypes: z
          .array(scopeDataTypeSchema)
          .min(1, 'dataTypes는 최소 1개를 지정해야 합니다'),
        createdPeriod: scopeCreatedPeriodSchema.optional(),
      }),
      intent: z.undefined().optional(),
    }),
  ])
  .describe('매크로 뷰 데이터 스코프 필터 조건');

export const createMacroViewSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  scopeFilter: scopeFilterSchema,
});

export const updateMacroViewSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    scopeFilter: scopeFilterSchema.optional(),
  })
  .refine(
    (v) => v.title !== undefined || v.description !== undefined || v.scopeFilter !== undefined,
    { message: '수정할 필드를 최소 1개 이상 제공해야 합니다' }
  );

export const macroViewSortKeySchema = z.enum(['updatedAt', 'createdAt', 'nodeCount', 'title']);

export const listMacroViewsQuerySchema = z.object({
  sortBy: macroViewSortKeySchema.optional(),
  onlyDeleted: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});
