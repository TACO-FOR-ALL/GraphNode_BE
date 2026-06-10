/**
 * AWS S3 SDK 오류에서 NoSuchKey(404) 여부를 판별합니다.
 */
export function isS3NotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidates: unknown[] = [error];
  const details = (error as { details?: { originalError?: unknown } }).details;
  if (details?.originalError) {
    candidates.push(details.originalError);
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const e = candidate as {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    if (e.name === "NoSuchKey" || e.Code === "NoSuchKey") return true;
    if (e.$metadata?.httpStatusCode === 404) return true;
  }

  return false;
}

/**
 * S3 객체 부재 시 사용자·운영자에게 보여줄 메시지.
 */
export function s3MissingObjectMessage(key: string): string {
  return `파일 데이터를 찾을 수 없습니다. 업로드가 완료되지 않았거나 저장소에서 삭제되었을 수 있습니다. (${key})`;
}
