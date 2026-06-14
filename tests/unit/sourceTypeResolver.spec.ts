import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  resolveSourceTypeByOrigId,
  resolveSourceTypesByOrigIds,
  macroFileTypeFromUserFileDoc,
} from '../../src/workers/utils/sourceTypeResolver';
import type { UserFileDoc } from '../../src/core/types/persistence/userFile.persistence';
import type { NotionPageCacheDoc } from '../../src/core/types/persistence/notion_cache.persistence';

const NOTION_UUID = '2076ca0e-0c92-8028-a83d-c50624d1c76f';
const NOTION_ORIG_ID = `src1_${NOTION_UUID}`;

const makeNotionDoc = (pageId: string, userId: string): NotionPageCacheDoc => ({
  _id: pageId,
  ownerUserId: userId,
  integrationId: 'int-1',
  notionWorkspaceId: 'ws-1',
  title: 'Test Notion Page',
  blockTree: [],
  plainText: 'test',
  notionLastEditedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  isStale: false,
});

describe('sourceTypeResolver', () => {
  const userId = 'user-1';

  let conversationService: { findDocById: ReturnType<typeof jest.fn> };
  let noteService: { getNoteDoc: ReturnType<typeof jest.fn> };
  let userFileService: { getActiveUserFileById: ReturnType<typeof jest.fn> };
  let notionCacheRepo: { findByPageId: ReturnType<typeof jest.fn> };

  beforeEach(() => {
    conversationService = { findDocById: jest.fn(async () => null) };
    noteService = { getNoteDoc: jest.fn(async () => null) };
    userFileService = { getActiveUserFileById: jest.fn(async () => null) };
    notionCacheRepo = { findByPageId: jest.fn(async () => null) };
  });

  const makeDeps = () => ({
    conversationService: conversationService as never,
    noteService: noteService as never,
    userFileService: userFileService as never,
    notionCacheRepo: notionCacheRepo as never,
  });

  it('resolves chat when only conversation exists', async () => {
    conversationService.findDocById = jest.fn(async () => ({ _id: 'conv-1' }));
    const resolved = await resolveSourceTypeByOrigId('conv-1', userId, makeDeps());
    expect(resolved.sourceType).toBe('chat');
    expect(notionCacheRepo.findByPageId).not.toHaveBeenCalled();
  });

  it('resolves file with hint for user_files', async () => {
    const doc = {
      _id: 'uf-1',
      displayName: 'slides.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    } as UserFileDoc;
    userFileService.getActiveUserFileById = jest.fn(async () => doc);

    const resolved = await resolveSourceTypeByOrigId('uf-1', userId, makeDeps());

    expect(resolved.sourceType).toBe('file');
    expect(resolved.userFileHint?.macroFileType).toBe('powerpoint');
    expect(notionCacheRepo.findByPageId).not.toHaveBeenCalled();
  });

  it('throws when multiple sources match the same origId', async () => {
    conversationService.findDocById = jest.fn(async () => ({ _id: 'x' }));
    noteService.getNoteDoc = jest.fn(async () => ({ _id: 'x' }));

    await expect(
      resolveSourceTypeByOrigId('x', userId, makeDeps())
    ).rejects.toThrow('ambiguous');
  });

  it('batch resolver reports unresolved origIds', async () => {
    const batch = await resolveSourceTypesByOrigIds(['missing-id'], userId, makeDeps());
    expect(batch.unresolvedOrigIds).toEqual(['missing-id']);
  });

  it('macroFileTypeFromUserFileDoc maps extensions', () => {
    expect(
      macroFileTypeFromUserFileDoc({
        displayName: 'a.pdf',
        mimeType: 'application/pdf',
      } as UserFileDoc)
    ).toBe('pdf');
    expect(
      macroFileTypeFromUserFileDoc({
        displayName: 'a.docx',
        mimeType: 'application/octet-stream',
      } as UserFileDoc)
    ).toBe('word');
  });

  // ── AC-11: notion origId 판별 테스트 ──

  it('(AC-11a) notion origId(src1_<UUID>) → notionCacheRepo 조회 성공 시 "notion" 반환', async () => {
    notionCacheRepo.findByPageId = jest.fn(async () => makeNotionDoc(NOTION_UUID, userId));

    const resolved = await resolveSourceTypeByOrigId(NOTION_ORIG_ID, userId, makeDeps());

    expect(resolved.sourceType).toBe('notion');
    expect(resolved.normalizedOrigId).toBe(NOTION_UUID);
    expect(notionCacheRepo.findByPageId).toHaveBeenCalledWith(NOTION_UUID, userId);
  });

  it('(AC-11b) notion origId인데 캐시 미존재 → sourceType null 반환', async () => {
    const resolved = await resolveSourceTypeByOrigId(NOTION_ORIG_ID, userId, makeDeps());

    expect(resolved.sourceType).toBeNull();
    expect(notionCacheRepo.findByPageId).toHaveBeenCalledWith(NOTION_UUID, userId);
  });

  it('(AC-11c) chat origId가 먼저 매칭되면 notionCacheRepo 호출 없음', async () => {
    conversationService.findDocById = jest.fn(async () => ({ _id: 'conv-1' }));

    const resolved = await resolveSourceTypeByOrigId('conv-1', userId, makeDeps());

    expect(resolved.sourceType).toBe('chat');
    expect(notionCacheRepo.findByPageId).not.toHaveBeenCalled();
  });

  it('(AC-11c) note origId가 먼저 매칭되면 notionCacheRepo 호출 없음', async () => {
    noteService.getNoteDoc = jest.fn(async () => ({ _id: 'note-1' }));

    const resolved = await resolveSourceTypeByOrigId('note-1', userId, makeDeps());

    expect(resolved.sourceType).toBe('markdown');
    expect(notionCacheRepo.findByPageId).not.toHaveBeenCalled();
  });

  it('batch resolver: notion origId 포함 배치에서 notion과 unresolved 각각 분리', async () => {
    const cachedNotionId = 'aa11bb22-cc33-dd44-ee55-ff6677889900';
    const uncachedNotionId = 'src1_00000000-0000-0000-0000-000000000000';
    const uncachedNorm = '00000000-0000-0000-0000-000000000000';

    notionCacheRepo.findByPageId = jest.fn(async (pageId: string) =>
      pageId === cachedNotionId ? makeNotionDoc(cachedNotionId, userId) : null
    );

    const batch = await resolveSourceTypesByOrigIds(
      [cachedNotionId, uncachedNotionId],
      userId,
      makeDeps()
    );

    expect(batch.sourceTypesByOrigId.get(cachedNotionId)).toBe('notion');
    expect(batch.unresolvedOrigIds).toContain(uncachedNorm);
  });
});
