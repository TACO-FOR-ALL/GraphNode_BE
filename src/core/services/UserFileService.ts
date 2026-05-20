import { ulid } from 'ulid';

import { UserFileRepository } from '../ports/UserFileRepository';
import { NoteRepository } from '../ports/NoteRepository';
import { GraphManagementService } from './GraphManagementService';
import { StoragePort } from '../ports/StoragePort';
import { UserFileDoc } from '../types/persistence/userFile.persistence';
import { assertAllowedUserFile, defaultMimeForUserFile } from '../../shared/config/fileUploadSpec';
import { buildStorageKey, STORAGE_BUCKETS } from '../../config/storageConfig';
import { loadEnv } from '../../config/env';
import { NotFoundError, ValidationError } from '../../shared/errors/domain';
import { withRetry } from '../../shared/utils/retry';
import type {
  UserFileDto,
  SidebarItemDto,
  SidebarItemsResponseDto,
  UserFilePresignedViewUrlDto,
  UserFilePatchDto,
  UserFileSummaryPreviewResponseDto,
  UserFileSummaryFullResponseDto,
} from '../../shared/dtos/userFile';
import type { NoteDoc } from '../types/persistence/note.persistence';
import type { AiInteractionService } from './AiInteractionService';
import { logger } from '../../shared/utils/logger';

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
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * 브라우저 뷰어용 `Content-Disposition` 값을 만든다.
 * RFC 5987 `filename*` 형식만 사용해 비 ASCII 파일명도 표시 가능하게 한다.
 */
function buildViewerContentDisposition(
  displayName: string,
  disposition: 'inline' | 'attachment'
): string {
  const encoded = encodeURIComponent(displayName);
  return `${disposition}; filename*=UTF-8''${encoded}`;
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
 * - 업로드 후 백그라운드에서 추출+LLM 요약을 실행하고 DB에 저장 (외부 AI 서버 큐 없음)
 * - 사이드바용 노트+파일 병합 목록 제공
 * - 프론트 파일 뷰어용 S3 Presigned GET URL 발급 (소유 검증 후)
 */
export class UserFileService {
  constructor(
    private readonly userFileRepo: UserFileRepository,
    private readonly noteRepo: NoteRepository,
    private readonly storagePort: StoragePort,
    private readonly graphManagementService: GraphManagementService,
    private readonly aiInteractionService: AiInteractionService
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
   * 바이너리를 S3에 올리고 DB에 메타를 저장한 뒤, 요약 작업을 백그라운드에서 시작한다.
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
      createdAt: new Date(0),
      updatedAt: new Date(0),
      deletedAt: null,
    };

    const created = await withRetry(async () => this.userFileRepo.insert(doc), {
      label: 'UserFileService.upload.insert',
    });

    this.enqueueSummaryJob(userId, id);

    return toUserFileDto(created);
  }

  /**
   * 업로드 응답을 막지 않기 위해 `setImmediate`로 요약 파이프라인을 비동기 실행한다.
   */
  private enqueueSummaryJob(userId: string, fileId: string): void {
    setImmediate(() => {
      void this.runSummaryJob(userId, fileId).catch((err: unknown) => {
        logger.error({ err, userId, fileId }, 'UserFileService.runSummaryJob failed (unhandled)');
      });
    });
  }

  /**
   * 요약 작업을 비동기 실행한다.
   * @param userId 유저 ID
   * @param fileId 파일 ID
   */
  private async runSummaryJob(userId: string, fileId: string): Promise<void> {
    const doc =
      (await withRetry(async () => this.userFileRepo.getById(fileId, userId, false), {
        label: 'UserFileService.runSummaryJob.getById',
      })) ?? null;
    if (!doc || doc.deletedAt) return;

    const result = await this.aiInteractionService.summarizeUserLibraryFile({
      userId,
      s3Key: doc.s3Key,
      displayName: doc.displayName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
    });

    if (result.ok) {
      await withRetry(
        async () =>
          this.userFileRepo.updateById(fileId, userId, {
            summaryStatus: 'completed',
            summary: result.data.summary,
            summaryStructured: result.data.structured,
            summaryError: null,
          }),
        { label: 'UserFileService.runSummaryJob.completed' }
      );
    } else {
      await withRetry(
        async () =>
          this.userFileRepo.updateById(fileId, userId, {
            summaryStatus: 'failed',
            summaryError: result.error,
          }),
        { label: 'UserFileService.runSummaryJob.failed' }
      );
    }
  }

  /**
   * 파일 메타데이터와 요약본을 조회한다.
   * @param userId 유저 ID
   * @param fileId 파일 ID
   * @returns 파일 DTO
   */
  async getFile(userId: string, fileId: string): Promise<UserFileDto> {
    const doc = await withRetry(async () => this.userFileRepo.getById(fileId, userId), {
      label: 'UserFileService.getFile',
    });
    if (!doc) throw new NotFoundError(`파일을 찾을 수 없습니다: ${fileId}`);
    return toUserFileDto(doc);
  }

  /**
   * AI 구조화 요약의 1번(한 줄)만 조회한다.
   * @param userId 소유자 ID
   * @param fileId 파일 ID
   */
  async getUserFileSummaryPreview(
    userId: string,
    fileId: string
  ): Promise<UserFileSummaryPreviewResponseDto> {
    const doc = await withRetry(async () => this.userFileRepo.getById(fileId, userId), {
      label: 'UserFileService.getUserFileSummaryPreview',
    });
    if (!doc) throw new NotFoundError(`파일을 찾을 수 없습니다: ${fileId}`);
    const oneLine =
      doc.summaryStructured?.oneLine?.trim() || doc.summary?.trim() || null;
    return {
      summaryStatus: doc.summaryStatus,
      summaryError: doc.summaryError ?? null,
      oneLine: doc.summaryStatus === 'completed' ? oneLine : null,
    };
  }

  /**
   * AI 구조화 요약 전체(1~4번)를 조회한다.
   * @param userId 소유자 ID
   * @param fileId 파일 ID
   */
  async getUserFileSummaryFull(
    userId: string,
    fileId: string
  ): Promise<UserFileSummaryFullResponseDto> {
    const doc = await withRetry(async () => this.userFileRepo.getById(fileId, userId), {
      label: 'UserFileService.getUserFileSummaryFull',
    });
    if (!doc) throw new NotFoundError(`파일을 찾을 수 없습니다: ${fileId}`);
    if (doc.summaryStatus !== 'completed') {
      return {
        summaryStatus: doc.summaryStatus,
        summaryError: doc.summaryError ?? null,
        oneLine: null,
        purpose: null,
        keyPoints: [],
        conclusion: null,
      };
    }
    if (doc.summaryStructured) {
      const s = doc.summaryStructured;
      return {
        summaryStatus: 'completed',
        summaryError: doc.summaryError ?? null,
        oneLine: s.oneLine,
        purpose: s.purpose,
        keyPoints: s.keyPoints,
        conclusion: s.conclusion,
      };
    }
    const legacy = doc.summary?.trim();
    return {
      summaryStatus: 'completed',
      summaryError: null,
      oneLine: legacy ?? null,
      purpose: null,
      keyPoints: [],
      conclusion: null,
    };
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

  /**
   * 파일 뷰어용 Presigned GET URL을 발급한다.
   *
   * - 소유자·활성 파일만 허용 (`getFileDocForOwner`와 동일 검증).
   * - 업로드 시 사용한 버킷과 동일하게 `downloadFile` 기본(페이로드 버킷)으로 서명한다.
   * - 만료 시간은 `USER_FILE_PRESIGN_TTL_SECONDS` 환경 변수로 조정한다.
   */
  async getPresignedViewUrl(
    userId: string,
    fileId: string,
    opts?: { disposition?: 'inline' | 'attachment' }
  ): Promise<UserFilePresignedViewUrlDto> {
    const doc = await this.getFileDocForOwner(userId, fileId);
    const env = loadEnv();
    const expiresInSeconds = env.USER_FILE_PRESIGN_TTL_SECONDS;
    const disposition = opts?.disposition === 'attachment' ? 'attachment' : 'inline';
    const contentType = doc.mimeType || 'application/octet-stream';
    const contentDisposition = buildViewerContentDisposition(doc.displayName, disposition);

    const url = await withRetry(
      async () =>
        this.storagePort.getPresignedGetUrl(doc.s3Key, {
          expiresInSeconds,
          responseContentType: contentType,
          responseContentDisposition: contentDisposition,
        }),
      { label: 'UserFileService.getPresignedViewUrl' }
    );

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    return { url, expiresInSeconds, expiresAt };
  }

  /**
   * 파일 목록을 조회한다.
   * @param userId 유저 ID
   * @param folderId 폴더 ID
   * @param limit 제한
   * @param cursor 커서
   * @returns 파일 목록
   */
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

  /**
   * 파일 표시 이름(`displayName`) 또는 폴더 위치(`folderId`)를 변경한다.
   *
   * - 두 필드 모두 `undefined`이면 ValidationError.
   * - `folderId`를 변경할 경우 대상 폴더 존재·소유 검증 후 목적지 폴더 기준으로 이름 중복을 확인한다.
   * - `displayName`만 변경할 경우 현재 폴더 기준으로 이름 중복을 확인한다.
   * - 중복 검사 시 **자기 자신의 현재 이름은 목록에서 제외**한다.
   *   (예: `a.pdf → a.pdf` 동명 변경 시 `a(1).pdf`가 되는 오탐 방지)
   */
  async updateFile(
    userId: string,
    fileId: string,
    patch: UserFilePatchDto
  ): Promise<UserFileDto> {
    if (patch.displayName === undefined && patch.folderId === undefined) {
      throw new ValidationError('변경할 내용이 없습니다. displayName 또는 folderId 중 하나를 포함해야 합니다.');
    }

    const doc = await this.getFileDocForOwner(userId, fileId);

    // folderId 변경이 있으면 대상 폴더 존재·소유 검증
    const targetFolderId: string | null =
      patch.folderId !== undefined ? patch.folderId : doc.folderId;
    if (patch.folderId !== undefined && patch.folderId !== null) {
      const folder = await withRetry(
        async () => this.noteRepo.getFolder(patch.folderId as string, userId),
        { label: 'UserFileService.update.getFolder' }
      );
      if (!folder || folder.deletedAt) {
        throw new NotFoundError(`폴더를 찾을 수 없습니다: ${patch.folderId}`);
      }
    }

    // 최종 적용할 displayName 결정 (중복 검사)
    let resolvedDisplayName: string = doc.displayName;
    if (patch.displayName !== undefined) {
      const rawName = patch.displayName.trim();
      if (!rawName) throw new ValidationError('파일 이름이 비어 있습니다.');

      const existingNames = await withRetry(
        async () => this.userFileRepo.listActiveDisplayNamesInFolder(userId, targetFolderId),
        { label: 'UserFileService.update.listNames' }
      );
      // 자기 자신의 현재 이름을 목록에서 제거해 동명 변경 시 오탐 방지
      const filteredNames = existingNames.filter((n) => n !== doc.displayName);
      resolvedDisplayName = resolveDisplayName(rawName, filteredNames);
    } else if (patch.folderId !== undefined) {
      // 이름 변경 없이 폴더 이동만 하는 경우: 목적지 폴더에서 이름 충돌 확인
      const existingNames = await withRetry(
        async () => this.userFileRepo.listActiveDisplayNamesInFolder(userId, targetFolderId),
        { label: 'UserFileService.update.listNamesMoveOnly' }
      );
      resolvedDisplayName = resolveDisplayName(doc.displayName, existingNames);
    }

    const updated = await withRetry(
      async () =>
        this.userFileRepo.updateById(fileId, userId, {
          displayName: resolvedDisplayName,
          folderId: targetFolderId,
        }),
      { label: 'UserFileService.update' }
    );
    if (!updated) throw new NotFoundError(`파일을 찾을 수 없습니다: ${fileId}`);
    return toUserFileDto(updated);
  }
}
