import { loadEnv } from '../../config/env';
import { ValidationError } from '../errors/domain';

export type BulkImportInput = {
  conversations: { messages?: unknown[] }[];
};

/**
 * Bulk import 요청의 대화/메시지 개수 및 Content-Length 상한을 검증합니다.
 * 초과 시 ValidationError(400) — ZIP import 또는 요청 분할을 안내합니다.
 */
export function assertBulkImportWithinLimits(
  input: BulkImportInput,
  contentLengthHeader?: string | string[] | undefined
): void {
  const env = loadEnv();
  const conversationCount = input.conversations.length;
  const messageCount = input.conversations.reduce(
    (acc, c) => acc + (c.messages?.length ?? 0),
    0
  );

  if (conversationCount > env.BULK_MAX_CONVERSATIONS) {
    throw new ValidationError(
      `Bulk import exceeds maximum conversation count (${env.BULK_MAX_CONVERSATIONS}). Split the request or use ZIP import.`,
      {
        field: 'conversationCount',
        limit: env.BULK_MAX_CONVERSATIONS,
        actual: conversationCount,
      }
    );
  }

  if (messageCount > env.BULK_MAX_MESSAGES) {
    throw new ValidationError(
      `Bulk import exceeds maximum message count (${env.BULK_MAX_MESSAGES}). Split the request or use ZIP import.`,
      {
        field: 'messageCount',
        limit: env.BULK_MAX_MESSAGES,
        actual: messageCount,
      }
    );
  }

  const raw = Array.isArray(contentLengthHeader)
    ? contentLengthHeader[0]
    : contentLengthHeader;
  const contentLength = raw != null ? Number(raw) : NaN;
  if (
    Number.isFinite(contentLength) &&
    contentLength > env.BULK_MAX_CONTENT_LENGTH_BYTES
  ) {
    throw new ValidationError(
      `Bulk import request body exceeds maximum size (${env.BULK_MAX_CONTENT_LENGTH_BYTES} bytes). Split the request or use ZIP import.`,
      {
        field: 'contentLength',
        limitBytes: env.BULK_MAX_CONTENT_LENGTH_BYTES,
        actualBytes: contentLength,
      }
    );
  }
}
