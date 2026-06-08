/**
 * Import finalize용 결정론적 ID — jobId + provider 키로 uuid v5 생성.
 * SQS 재시도·finalize 재호출 시 동일 _id로 멱등 insert 보장.
 */
import { v5 as uuidv5 } from 'uuid';

/** Import 전용 namespace (고정 UUID) */
const IMPORT_ID_NAMESPACE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

export function importConversationId(jobId: string, providerConversationId: string): string {
  return uuidv5(`conv:${jobId}:${providerConversationId}`, IMPORT_ID_NAMESPACE);
}

export function importMessageId(jobId: string, providerMessageId: string): string {
  return uuidv5(`msg:${jobId}:${providerMessageId}`, IMPORT_ID_NAMESPACE);
}
