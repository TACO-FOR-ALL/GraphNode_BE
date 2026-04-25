/**
 * 모듈: ModelMessage 변환 유틸리티
 *
 * 책임:
 * - GraphNode ChatMessage[] → Vercel AI SDK ModelMessage[] 변환
 * - S3 첨부파일 다운로드 및 documentProcessor 처리 후 인라인 삽입
 * - openai / claude / gemini Provider 구현체가 공통으로 사용합니다.
 */

import type { ModelMessage, TextPart, ImagePart } from 'ai';
import { Readable } from 'stream';

import { ChatMessage } from '../dtos/ai';
import { StoragePort } from '../../core/ports/StoragePort';
import { documentProcessor, ProcessedDocument } from '../utils/documentProcessor';
import { logger } from '../utils/logger';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * GraphNode ChatMessage 배열을 Vercel AI SDK ModelMessage 배열로 변환합니다.
 *
 * @description
 *   - system/assistant 역할은 string content로 변환합니다.
 *   - user 역할은 텍스트 + 첨부파일(이미지/텍스트)을 ContentPart 배열로 조립합니다.
 *   - storageAdapter가 없으면 첨부파일 처리를 건너뜁니다.
 * @param messages 변환할 ChatMessage 배열
 * @param storageAdapter S3 파일 다운로드용 어댑터 (Optional)
 * @returns Vercel AI SDK ModelMessage 배열
 */
export async function buildCoreMessages(
  messages: ChatMessage[],
  storageAdapter?: StoragePort
): Promise<ModelMessage[]> {
  const result: ModelMessage[] = [];

  for (const msg of messages) {
    // system, assistant 역할은 string content로 변환
    if (msg.role === 'system') {
      result.push({ role: 'system', content: msg.content });
      continue;
    }

    if (msg.role === 'assistant') {
      result.push({ role: 'assistant', content: msg.content });
      continue;
    }

    // user 메시지 — 텍스트 + 첨부파일 ContentPart 조립
    const contentParts: (TextPart | ImagePart)[] = [];

    if (msg.content) {
      contentParts.push({ type: 'text', text: msg.content });
    }

    // 첨부파일 처리 (image, text)
    if (msg.attachments && msg.attachments.length > 0 && storageAdapter) {
      for (const att of msg.attachments) {
        // S3에서 파일 다운로드 → buffer 변환 → 문서 처리 → contentParts에 추가
        try {
          const stream = await storageAdapter.downloadStream(att.url, { bucketType: 'file' });
          const buffer = await streamToBuffer(stream as Readable);
          const processed: ProcessedDocument = await documentProcessor.process(
            buffer,
            att.mimeType,
            att.name
          );

          // 이미지(base64), 텍스트(text)로 변환 후 contentParts에 추가
          if (processed.type === 'image') {
            contentParts.push({
              type: 'image',
              image: Buffer.from(processed.content, 'base64'),
              mediaType: att.mimeType as `${string}/${string}`,
            });
          } else if (processed.type === 'text') {
            contentParts.push({ type: 'text', text: processed.content });
          }
        } catch (e) {
          logger.error(
            { err: e, fileKey: att.url, fileName: att.name },
            `buildCoreMessages: failed to process attachment ${att.id}`
          );
        }
      }
    }

    // 단순 텍스트만 있으면 string으로 축약 (SDK 권장)
    result.push({
      role: 'user',
      content:
        contentParts.length === 1 && contentParts[0].type === 'text'
          ? contentParts[0].text
          : contentParts,
    });
  }

  return result;
}
