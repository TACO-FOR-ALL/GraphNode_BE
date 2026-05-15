import AdmZip from 'adm-zip';

import type { StoragePort } from '../../ports/StoragePort';
import type { ChatExportPayload, ExportAttachmentRef, ExportConversationPayload } from './types';
import type { ChatThread } from '../../../shared/dtos/ai';
import { logger } from '../../../shared/utils/logger';

/**
 * @description 대화 스레드를 export JSON 대화 단위로 변환합니다.
 * @param thread ChatThread DTO
 */
export function threadToExportConversation(thread: ChatThread): ExportConversationPayload {
  return {
    conversation: {
      id: thread.id,
      title: thread.title,
      createdAt: thread.createdAt ?? new Date(0).toISOString(),
      updatedAt: thread.updatedAt ?? new Date(0).toISOString(),
      deletedAt: thread.deletedAt ?? null,
      summary: thread.summary,
    },
    messages: thread.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt ?? null,
      updatedAt: message.updatedAt ?? null,
      deletedAt: message.deletedAt ?? null,
      attachments: message.attachments?.map((att, index) =>
        toExportAttachmentRef(thread.id, message.id, att, index)
      ),
      metadata: message.metadata,
    })),
  };
}

/**
 * @description 첨부 메타를 export 참조 형태로 변환합니다.
 */
function toExportAttachmentRef(
  conversationId: string,
  messageId: string,
  att: NonNullable<ChatThread['messages'][0]['attachments']>[0],
  index: number
): ExportAttachmentRef {
  const safeName = sanitizeZipEntryName(att.name || `attachment-${index}`);
  const archivePath = `attachments/${conversationId}/${messageId}/${safeName}`;
  return {
    id: att.id,
    type: att.type,
    name: att.name,
    mimeType: att.mimeType,
    size: att.size,
    s3Key: att.url,
    archivePath,
  };
}

/**
 * @description ZIP 엔트리 파일명에 사용할 수 있도록 정규화합니다.
 */
function sanitizeZipEntryName(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/\.\./g, '_') || 'file';
}

/**
 * @description export JSON과 첨부 바이너리를 ZIP 버퍼로 묶습니다.
 * @param payload export.json 루트 객체
 * @param storage S3 다운로드용 StoragePort
 */
export async function buildExportZipBuffer(
  payload: ChatExportPayload,
  storage: StoragePort
): Promise<Buffer> {
  const zip = new AdmZip();
  zip.addFile('export.json', Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'));

  const seenS3Keys = new Set<string>();
  for (const conv of payload.conversations) {
    for (const message of conv.messages) {
      for (const att of message.attachments ?? []) {
        if (!att.s3Key?.trim() || seenS3Keys.has(att.s3Key)) continue;
        seenS3Keys.add(att.s3Key);
        try {
          const file = await storage.downloadFile(att.s3Key, { bucketType: 'file' });
          zip.addFile(att.archivePath, file.buffer);
        } catch (err: unknown) {
          logger.warn(
            { err, s3Key: att.s3Key, archivePath: att.archivePath },
            'Failed to include attachment in export zip — skipped'
          );
        }
      }
    }
  }

  return zip.toBuffer();
}
