import type { StoragePort } from '../../core/ports/StoragePort';
import { withRetry } from './retry';

/** Macro / AddNode S3 bundle `files/` 세그먼트에 올릴 사용자 파일 최소 필드 */
export interface MacroBundleUserFileSource {
  _id: string;
  displayName: string;
  s3Key: string;
  mimeType?: string;
}

/**
 * @description Macro·AddNode bundle `files/` 세그먼트용 표시명을 안전한 단일 파일명으로 정규화합니다.
 * @param displayName 사용자 파일 표시명입니다.
 * @returns `files/{id}_{name}` 에 쓸 파일명 조각입니다.
 */
export function sanitizeMacroBundleFileSegment(displayName: string): string {
  const base = displayName.replace(/\\/g, '/').split('/').pop() || 'file';
  return base.replace(/\.\./g, '_').replace(/[/\\]/g, '_').trim() || 'file';
}

/**
 * @description 활성 user_files 원본 바이트를 S3 bundle prefix `files/{id}_{displayName}` 로 복사합니다.
 * @param storagePort S3 스토리지 포트입니다.
 * @param taskPrefix 슬래시로 끝나는 작업 prefix (예: `add-node/{taskId}/`)입니다.
 * @param files 복사할 사용자 파일 목록입니다.
 * @returns Promise<void>
 */
export async function copyUserFilesToMacroBundlePrefix(
  storagePort: StoragePort,
  taskPrefix: string,
  files: MacroBundleUserFileSource[]
): Promise<void> {
  for (const f of files) {
    const downloaded = await withRetry(
      async () => await storagePort.downloadFile(f.s3Key, { bucketType: 'file' }),
      { label: 'Storage.downloadFile.userFileForBundle' }
    );
    const segment = sanitizeMacroBundleFileSegment(f.displayName);
    const destKey = `${taskPrefix}files/${f._id}_${segment}`;
    const contentType =
      f.mimeType?.trim() || downloaded.contentType || 'application/octet-stream';
    await withRetry(
      async () => await storagePort.upload(destKey, downloaded.buffer, contentType),
      { label: 'Storage.upload.bundleUserFile' }
    );
  }
}
