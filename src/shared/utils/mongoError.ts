/**
 * MongoDB 드라이버 에러를 UpstreamError details / 로그용으로 정규화합니다.
 */
export type MongoErrorSummary = {
  cause: string;
  mongoCode?: number;
  errorLabels?: string[];
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
};

function asMongoLike(err: unknown): {
  code?: number;
  message?: string;
  errorLabels?: string[];
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
} | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;
  return {
    code: typeof e.code === 'number' ? e.code : undefined,
    message: typeof e.message === 'string' ? e.message : undefined,
    errorLabels: Array.isArray(e.errorLabels)
      ? e.errorLabels.filter((l): l is string => typeof l === 'string')
      : undefined,
    keyPattern:
      e.keyPattern && typeof e.keyPattern === 'object'
        ? (e.keyPattern as Record<string, unknown>)
        : undefined,
    keyValue:
      e.keyValue && typeof e.keyValue === 'object'
        ? (e.keyValue as Record<string, unknown>)
        : undefined,
  };
}

/**
 * @param err MongoDB 또는 일반 Error
 * @returns Sentry/Problem details에 넣을 요약 필드
 */
export function summarizeMongoError(err: unknown): MongoErrorSummary {
  const mongo = asMongoLike(err);
  const message =
    mongo?.message ??
    (err instanceof Error ? err.message : undefined) ??
    String(err);

  return {
    cause: message,
    ...(mongo?.code !== undefined && { mongoCode: mongo.code }),
    ...(mongo?.errorLabels?.length && { errorLabels: mongo.errorLabels }),
    ...(mongo?.keyPattern && { keyPattern: mongo.keyPattern }),
    ...(mongo?.keyValue && { keyValue: mongo.keyValue }),
  };
}

export function isTransientMongoTransactionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const hasLabel = (err as { hasErrorLabel?: (label: string) => boolean }).hasErrorLabel;
  if (!hasLabel) return false;
  return (
    hasLabel('TransientTransactionError') || hasLabel('UnknownTransactionCommitResult')
  );
}

/**
 * import finalize failFinalize / 로그용 JSON 문자열 (File Service 2000자 제한 고려).
 */
export function formatImportFailureDetail(
  err: unknown,
  meta: Record<string, unknown>
): string {
  const payload = {
    ...meta,
    ...summarizeMongoError(err),
    errorCode: err instanceof Error && 'code' in err ? (err as AppErrorLike).code : undefined,
  };
  const json = JSON.stringify(payload);
  return json.length > 2000 ? `${json.slice(0, 1997)}...` : json;
}

type AppErrorLike = Error & { code?: string };
