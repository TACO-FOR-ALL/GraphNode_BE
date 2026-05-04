import { ulid } from 'ulid';

import { UserFileRepository } from '../ports/UserFileRepository';
import { NoteRepository } from '../ports/NoteRepository';
import { GraphManagementService } from './GraphManagementService';
import { StoragePort } from '../ports/StoragePort';
import { QueuePort } from '../ports/QueuePort';
import { UserFileDoc } from '../types/persistence/userFile.persistence';
import {
  assertAllowedUserFile,
  defaultMimeForUserFile,
} from '../../shared/config/fileUploadSpec';
import { buildStorageKey, STORAGE_BUCKETS } from '../../config/storageConfig';
import { NotFoundError, ValidationError } from '../../shared/errors/domain';
import { withRetry } from '../../shared/utils/retry';
import { TaskType, FileSummaryRequestPayload } from '../../shared/dtos/queue';
import type { UserFileDto, SidebarItemDto, SidebarItemsResponseDto } from '../../shared/dtos/userFile';
import type { NoteDoc } from '../types/persistence/note.persistence';

/** 영속 문서를 API용 DTO로 변환한다. */
function toUserFileDto(doc: UserFileDoc): UserFileDto {
  return {
    id: doc._id,
    folderId: doc.folderId,
    displayName: doc.displayName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    category: doc.category,
    summary: doc.summary,
    summaryStatus: doc.summaryStatus,
    summaryError: doc.summaryError ?? undefined,
    aiTaskId: doc.aiTaskId ?? undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** 경로 요소 제거·`..` 무력화 후 파일명만 남긴다. */
function basenameSafe(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() || 'file';
  return base.replace(/\.\./g, '_').trim() || 'file';
}

/**
 * 동일 폴더 내 활성 `displayName`과 겹치지 않도록 접미사 `이름(1).ext` 형태를 부여한다.
 */
function resolveDisplayName(original: string, existing: string[]): string {
  const set = new Set(existing);
  if (!set.has(original)) return original;
  const dot = original.lastIndexOf('.');
  const stem = dot >= 0 ? original.slice(0, dot) : original;
  const ext = dot >= 0 ? original.slice(dot) : '';
  let n = 1;
  while (n < 100_000) {
    const candidate = `${stem}(${n})${ext}`;
    if (!set.has(candidate)) return candidate;
    n++;
  }
  throw new ValidationError('같은 이름의 파일이 너무 많아 더 이상 자동 이름을 붙일 수 없습니다.');
}

/**
 * 모듈: 사용자 라이브러리 파일 서비스
 *
 * 책임:
 * - 업로드·목록·조회·삭제(소프트/하드) 및 S3·그래프 연동
 * - 업로드 후 요약 큐(`FILE_SUMMARY_REQUEST`) 발행
 * - 사이드바용 노트+파일 병합 목록 제공
 */
export class UserFileService {
  constructor(
    private readonly userFileRepo: UserFileRepository,
    private readonly noteRepo: NoteRepository,
    private readonly storagePort: StoragePort,
    private readonly queuePort: QueuePort,
    private readonly graphManagementService: GraphManagementService,
    private readonly jobQueueUrl: string
  ) {}

  /** 기준 시각 이후 수정된 활성 파일 (AddNode 증분 등). */
  async findFilesModifiedSince(userId: string, since: Date): Promise<UserFileDoc[]> {
    return withRetry(async () => this.userFileRepo.findModifiedSince(userId, since), {
      label: 'UserFileRepository.findModifiedSince',
    });
  }

  /** 휴지통 제외 전체 활성 파일 (매크로 그래프 `files.json` 등). */
  async listAllActiveFiles(userId: string): Promise<UserFileDoc[]> {
    return withRetry(async () => this.userFileRepo.listAllActive(userId), {
      label: 'UserFileRepository.listAllActive',
    });
  }

  /** sourceType 해석용: 삭제되지 않은 파일 한 건. */
  async getActiveUserFileById(id: string, userId: string): Promise<UserFileDoc | null> {
    return withRetry(async () => this.userFileRepo.getById(id, userId, false), {
      label: 'UserFileRepository.getById',
    });
  }

  /**
   * 지정 폴더의 노트와 파일을 `updatedAt` 기준으로 합쳐 정렬한다.
   * 페이징은 MVP로 각각 상한만큼 가져와 병합한다.
   */
  async listSidebarItems(
    userId: string,
    folderId: string | null,
    limit: number
  ): Promise<SidebarItemsResponseDto> {
    const cap = Math.min(Math.max(limit, 1), 200);
    const [notesRes, filesRes] = await Promise.all([
      withRetry(async () => this.noteRepo.listNotes(userId, folderId, cap), {
        label: 'UserFileService.listSidebar.listNotes',
      }),
      withRetry(async () => this.userFileRepo.listFiles(userId, folderId, cap), {
        label: 'UserFileService.listSidebar.listFiles',
      }),
    ]);

    const items: SidebarItemDto[] = [
      ...notesRes.items.map((n: NoteDoc) => ({
        kind: 'note' as const,
        id: n._id,
        title: n.title,
        folderId: n.folderId,
        updatedAt: n.updatedAt.toISOString(),
      })),
      ...filesRes.items.map((f) => ({
        kind: 'file' as const,
        id: f._id,
        title: f.displayName,
        folderId: f.folderId,
        updatedAt: f.updatedAt.toISOString(),
      })),
    ]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
      .slice(0, cap);

    return { items };
  }

  /**
   * 바이너리를 S3에 올리고 DB에 메타를 저장한 뒤 요약 큐를 발행한다.
   * `folderId`가 있으면 해당 폴더가 존재하고 삭제되지 않았는지 검증한다.
   */
  async uploadFile(
    userId: string,
    originalName: string,
    buffer: Buffer,
    folderId: string | null
  ): Promise<UserFileDto> {
    if (!buffer?.length) {
      throw new ValidationError('빈 파일은 업로드할 수 없습니다.');
    }

    if (folderId) {
      const folder = await withRetry(async () => this.noteRepo.getFolder(folderId, userId), {
        label: 'UserFileService.upload.getFolder',
      });
      if (!folder || folder.deletedAt) {
        throw new NotFoundError(`폴더를 찾을 수 없습니다: ${folderId}`);
      }
    }

    const safeName = basenameSafe(originalName);
    let allowed: ReturnType<typeof assertAllowedUserFile>;
    try {
      allowed = assertAllowedUserFile(safeName);
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : String(e));
    }

    const existing = await withRetry(
      async () => this.userFileRepo.listActiveDisplayNamesInFolder(userId, folderId),
      { label: 'UserFileService.upload.listNames' }
    );
    const displayName = resolveDisplayName(safeName, existing);

    const id = ulid();
    const physicalName = `${id}${allowed.ext}`;
    const s3Key = buildStorageKey(STORAGE_BUCKETS.USER_FILES, `${userId}/${physicalName}`);

    await withRetry(
      async () => this.storagePort.upload(s3Key, buffer, defaultMimeForUserFile(allowed.ext)),
      { label: 'UserFileService.upload.s3' }
    );

    const taskId = `file_summary_${userId}_${ulid()}`;

    const doc: UserFileDoc = {
      _id: id,
      ownerUserId: userId,
      folderId,
      displayName,
      s3Key,
      mimeType: defaultMimeForUserFile(allowed.ext),
      sizeBytes: buffer.length,
      category: allowed.category,
      summaryStatus: 'processing',
      aiTaskId: taskId,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      deletedAt: null,
    };

    const created = await withRetry(async () => this.userFileRepo.insert(doc), {
      label: 'UserFileService.upload.insert',
    });

    const messageBody: FileSummaryRequestPayload = {
      taskId,
      taskType: TaskType.FILE_SUMMARY_REQUEST,
      payload: {
        userId,
        fileId: id,
        s3Key,
        bucket: process.env.S3_PAYLOAD_BUCKET,
        displayName,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      await withRetry(async () => this.queuePort.sendMessage(this.jobQueueUrl, messageBody), {
        label: 'QueuePort.sendMessage.FileSummary',
      });
    } catch (err) {
      await withRetry(
        async () =>
          this.userFileRepo.updateById(id, userId, {
            summaryStatus: 'failed',
            summaryError: `큐_발행_실패: ${String(err)}`,
          }),
        { label: 'UserFileService.upload.enqueueRollback' }
      );
      throw err;
    }

    return toUserFileDto(created);
  }

  async getFile(userId: string, fileId: string): Promise<UserFileDto> {
    const doc = await withRetry(async () => this.userFileRepo.getById(fileId, userId), {
      label: 'UserFileService.getFile',
    });
    if (!doc) throw new NotFoundError(`파일을 찾을 수 없습니다: ${fileId}`);
    return toUserFileDto(doc);
  }

  /** 소유권이 맞는 활성 파일 문서 (내부용). */
  async getFileDocForOwner(userId: string, fileId: string): Promise<UserFileDoc> {
    const doc = await withRetry(async () => this.userFileRepo.getById(fileId, userId), {
      label: 'UserFileService.getFileDocForOwner',
    });
    if (!doc) throw new NotFoundError(`파일을 찾을 수 없습니다: ${fileId}`);
    return doc;
  }

  /** 브라우저 inline 표시 등을 위해 S3에서 원본 바이트를 읽는다. */
  async readFileBytes(
    userId: string,
    fileId: string
  ): Promise<{ buffer: Buffer; contentType: string; displayName: string }> {
    const doc = await this.getFileDocForOwner(userId, fileId);
    const downloaded = await withRetry(async () => this.storagePort.downloadFile(doc.s3Key), {
      label: 'UserFileService.readFileBytes',
    });
    return {
      buffer: downloaded.buffer,
      contentType: doc.mimeType || downloaded.contentType || 'application/octet-stream',
      displayName: doc.displayName,
    };
  }

  async listFiles(
    userId: string,
    folderId: string | null,
    limit: number,
    cursor?: string
  ): Promise<{ items: UserFileDto[]; nextCursor: string | null }> {
    const res = await withRetry(
      async () => this.userFileRepo.listFiles(userId, folderId, limit, cursor),
      { label: 'UserFileService.listFiles' }
    );
    return { items: res.items.map(toUserFileDto), nextCursor: res.nextCursor };
  }

  /**
   * `permanent=false`: 소프트 삭제 + 그래프 노드 soft 연쇄 삭제.
   * `permanent=true`: DB·S3 제거 + 그래프 노드 hard 연쇄 삭제.
   */
  async deleteFile(userId: string, fileId: string, permanent: boolean): Promise<void> {
    const doc =
      (await withRetry(async () => this.userFileRepo.getById(fileId, userId, true), {
        label: 'UserFileService.delete.get',
      })) ?? null;
    if (!doc) {
      throw new NotFoundError(`파일을 찾을 수 없습니다: ${fileId}`);
    }
    if (!permanent && doc.deletedAt) {
      throw new NotFoundError(`파일을 찾을 수 없습니다: ${fileId}`);
    }

    if (permanent) {
      const ok = await withRetry(async () => this.userFileRepo.hardDelete(fileId, userId), {
        label: 'UserFileService.delete.hard',
      });
      if (!ok) throw new NotFoundError(`파일을 찾을 수 없습니다: ${fileId}`);
      try {
        await withRetry(async () => this.storagePort.delete(doc.s3Key), {
          label: 'UserFileService.delete.s3',
        });
      } catch {
        // 비차단: S3 객체가 이미 없는 경우 등
      }
      await this.graphManagementService.deleteNodesByOrigIds(userId, [fileId], true);
      return;
    }

    const ok = await withRetry(async () => this.userFileRepo.softDelete(fileId, userId), {
      label: 'UserFileService.delete.soft',
    });
    if (!ok) throw new NotFoundError(`파일을 찾을 수 없습니다: ${fileId}`);
    await this.graphManagementService.deleteNodesByOrigIds(userId, [fileId], false);
  }
}
