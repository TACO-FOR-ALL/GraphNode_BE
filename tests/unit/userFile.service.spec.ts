/**
 * 목적: UserFileService 단위 테스트 (인메모리 목 Repository / 목 인프라).
 * - 실제 Mongo·S3·SQS 없이 업로드·목록·사이드바 병합·삭제 흐름을 검증한다.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { UserFileService } from '../../src/core/services/UserFileService';
import type { UserFileRepository } from '../../src/core/ports/UserFileRepository';
import type { NoteRepository } from '../../src/core/ports/NoteRepository';
import type { StoragePort } from '../../src/core/ports/StoragePort';
import type { QueuePort } from '../../src/core/ports/QueuePort';
import type { GraphManagementService } from '../../src/core/services/GraphManagementService';
import type { UserFileDoc } from '../../src/core/types/persistence/userFile.persistence';
import type { FolderDoc, NoteDoc } from '../../src/core/types/persistence/note.persistence';

const userId = 'user-file-spec-1';
const jobQueueUrl = 'http://mock-sqs.local/request';

function docTemplate(overrides: Partial<UserFileDoc> = {}): UserFileDoc {
  const now = new Date();
  return {
    _id: 'uf1',
    ownerUserId: userId,
    folderId: null,
    displayName: 'a.pdf',
    s3Key: 'user-files/x/a.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4,
    category: 'document',
    summaryStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe('UserFileService', () => {
  let files: Map<string, UserFileDoc>;
  let userFileRepo: jest.Mocked<UserFileRepository>;
  let noteRepo: jest.Mocked<NoteRepository>;
  let storage: jest.Mocked<StoragePort>;
  let queue: jest.Mocked<QueuePort>;
  let graph: jest.Mocked<GraphManagementService>;
  let service: UserFileService;

  beforeEach(() => {
    files = new Map();
    userFileRepo = {
      insert: jest.fn(async (d: UserFileDoc): Promise<UserFileDoc> => {
        files.set(d._id, { ...d });
        return d;
      }),
      getById: jest.fn(
        async (id: string, owner: string, includeDeleted = false): Promise<UserFileDoc | null> => {
          const f = files.get(id);
          if (!f || f.ownerUserId !== owner) return null;
          if (!includeDeleted && f.deletedAt) return null;
          return f;
        }
      ),
      listFiles: jest.fn(
        async (
          owner: string,
          folderId: string | null,
          limit: number,
          cursor?: string
        ): Promise<{ items: UserFileDoc[]; nextCursor: string | null }> => {
          let rows = [...files.values()].filter(
            (f) => f.ownerUserId === owner && f.folderId === folderId && !f.deletedAt
          );
          rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
          if (cursor) {
            const t = new Date(parseInt(String(cursor), 10));
            rows = rows.filter((f) => f.updatedAt < t);
          }
          const items = rows.slice(0, limit);
          const last = items[items.length - 1];
          const nextCursor =
            items.length === limit && last ? String(last.updatedAt.getTime()) : null;
          return { items, nextCursor };
        }
      ),
      listActiveDisplayNamesInFolder: jest.fn(
        async (owner: string, folderId: string | null): Promise<string[]> =>
          [...files.values()]
            .filter((f) => f.ownerUserId === owner && f.folderId === folderId && !f.deletedAt)
            .map((f) => f.displayName)
      ),
      updateById: jest.fn(
        async (id: string, owner: string, patch: Partial<UserFileDoc>): Promise<UserFileDoc | null> => {
          const f = files.get(id);
          if (!f || f.ownerUserId !== owner || f.deletedAt) return null;
          const next = { ...f, ...patch, updatedAt: new Date() } as UserFileDoc;
          files.set(id, next);
          return next;
        }
      ),
      softDelete: jest.fn(async (id: string, owner: string): Promise<boolean> => {
        const f = files.get(id);
        if (!f || f.ownerUserId !== owner || f.deletedAt) return false;
        f.deletedAt = new Date();
        return true;
      }),
      hardDelete: jest.fn(async (id: string, owner: string): Promise<boolean> => {
        const f = files.get(id);
        if (!f || f.ownerUserId !== owner) return false;
        files.delete(id);
        return true;
      }),
      findModifiedSince: jest.fn(async (owner: string, since: Date): Promise<UserFileDoc[]> =>
        [...files.values()].filter(
          (f) => f.ownerUserId === owner && !f.deletedAt && f.updatedAt > since
        )
      ),
      listAllActive: jest.fn(async (owner: string): Promise<UserFileDoc[]> =>
        [...files.values()].filter((f) => f.ownerUserId === owner && !f.deletedAt)
      ),
    } as unknown as jest.Mocked<UserFileRepository>;

    noteRepo = {
      getFolder: jest.fn(
        async (id: string, owner: string, _includeDeleted?: boolean): Promise<FolderDoc | null> => {
          if (id === 'folder-1' && owner === userId) {
            const f: FolderDoc = {
              _id: 'folder-1',
              ownerUserId: userId,
              name: 'F',
              parentId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
            };
            return f;
          }
          return null;
        }
      ),
      listNotes: jest.fn(
        async (
          owner: string,
          folderId: string | null,
          _limit: number,
          _cursor?: string
        ): Promise<{ items: NoteDoc[]; nextCursor: string | null }> => {
          const n: NoteDoc = {
            _id: 'note-1',
            ownerUserId: owner,
            title: 'N',
            content: '',
            folderId,
            createdAt: new Date('2020-01-02'),
            updatedAt: new Date('2020-01-02'),
            deletedAt: null,
          };
          if (owner === userId && folderId === null) {
            return { items: [n], nextCursor: null };
          }
          return { items: [], nextCursor: null };
        }
      ),
    } as unknown as jest.Mocked<NoteRepository>;

    storage = {
      upload: jest.fn(async () => undefined),
      downloadFile: jest.fn(async (key: string) => ({
        buffer: Buffer.from(`bytes-for-${key}`),
        contentType: 'application/pdf',
      })),
      delete: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<StoragePort>;

    queue = {
      sendMessage: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<QueuePort>;

    graph = {
      deleteNodesByOrigIds: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<GraphManagementService>;

    service = new UserFileService(
      userFileRepo,
      noteRepo,
      storage,
      queue,
      graph,
      jobQueueUrl
    );
  });

  it('PDF 업로드 시 S3 업로드·큐 발행·문서 생성이 수행된다', async () => {
    const dto = await service.uploadFile(userId, 'report.pdf', Buffer.from('%PDF-1'), null);

    expect(dto.displayName).toBe('report.pdf');
    expect(dto.mimeType).toBe('application/pdf');
    expect(storage.upload).toHaveBeenCalled();
    expect(queue.sendMessage).toHaveBeenCalledWith(
      jobQueueUrl,
      expect.objectContaining({
        taskType: 'FILE_SUMMARY_REQUEST',
        payload: expect.objectContaining({ userId, fileId: dto.id }),
      })
    );
    expect(userFileRepo.insert).toHaveBeenCalled();
  });

  it('허용되지 않은 확장자는 ValidationError로 거절된다', async () => {
    await expect(
      service.uploadFile(userId, 'x.exe', Buffer.from('MZ'), null)
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('listSidebarItems는 노트와 파일을 updatedAt 기준으로 합친다', async () => {
    const older = new Date('2019-01-01');
    const newer = new Date('2021-06-01');
    files.set('f1', {
      ...docTemplate({
        _id: 'f1',
        displayName: 'doc.pdf',
        updatedAt: newer,
        createdAt: older,
        summaryStatus: 'completed',
      }),
    });

    const res = await service.listSidebarItems(userId, null, 10);
    expect(res.items.length).toBe(2);
    expect(res.items[0].kind).toBe('file');
    expect(res.items[0].updatedAt >= res.items[1].updatedAt).toBe(true);
    const kinds = res.items.map((i) => i.kind).sort();
    expect(kinds).toEqual(['file', 'note']);
  });

  it('소프트 삭제 시 그래프 연쇄 삭제를 비영구로 호출한다', async () => {
    files.set('f2', docTemplate({ _id: 'f2', displayName: 'a.pdf' }));

    await service.deleteFile(userId, 'f2', false);

    expect(userFileRepo.softDelete).toHaveBeenCalledWith('f2', userId);
    expect(graph.deleteNodesByOrigIds).toHaveBeenCalledWith(userId, ['f2'], false);
  });

  it('readFileBytes는 S3에서 바이트를 읽어온다', async () => {
    files.set('f3', docTemplate({ _id: 'f3', s3Key: 'user-files/u/f3.pdf' }));

    const r = await service.readFileBytes(userId, 'f3');
    expect(r.displayName).toBe('a.pdf');
    expect(storage.downloadFile).toHaveBeenCalledWith('user-files/u/f3.pdf');
    expect(r.buffer.length).toBeGreaterThan(0);
  });
});
