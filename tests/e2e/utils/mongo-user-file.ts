import type { Document } from 'mongodb';

import type { UserFileDoc } from '../../../src/core/types/persistence/userFile.persistence';
import type { UserFileCategory } from '../../../src/shared/config/fileUploadSpec';

/**
 * @description MongoDB `user_files` 조회 결과를 `UserFileDoc`으로 정규화합니다(E2E assertion용).
 * @param raw Mongo driver가 반환한 문서입니다.
 * @returns `macroFileTypeFromUserFileDoc` 등에 넘길 수 있는 `UserFileDoc`.
 */
export function toUserFileDoc(raw: Document): UserFileDoc {
  const categoryRaw = typeof raw.category === 'string' ? raw.category : 'unknown';

  return {
    _id: String(raw._id),
    ownerUserId: String(raw.ownerUserId ?? ''),
    folderId: raw.folderId == null ? null : String(raw.folderId),
    displayName: String(raw.displayName ?? ''),
    s3Key: String(raw.s3Key ?? ''),
    mimeType: String(raw.mimeType ?? ''),
    sizeBytes: Number(raw.sizeBytes ?? 0),
    category: categoryRaw as UserFileCategory,
    summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    summaryStatus:
      raw.summaryStatus === 'pending' ||
      raw.summaryStatus === 'processing' ||
      raw.summaryStatus === 'completed' ||
      raw.summaryStatus === 'failed'
        ? raw.summaryStatus
        : 'completed',
    summaryError:
      raw.summaryError === null || typeof raw.summaryError === 'string'
        ? raw.summaryError
        : undefined,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(),
    deletedAt: raw.deletedAt == null ? null : raw.deletedAt instanceof Date ? raw.deletedAt : null,
  };
}
