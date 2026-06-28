/**
 * File Service Problem JSON body에서 detail 추출.
 */
export function parseFileServiceProblemDetail(data: unknown, fallback?: string): string | undefined {
  if (!data || typeof data !== 'object') return fallback;
  const b = data as Record<string, unknown>;
  if (typeof b.detail === 'string') return b.detail;
  if (typeof b.message === 'string') return b.message;
  return fallback;
}
