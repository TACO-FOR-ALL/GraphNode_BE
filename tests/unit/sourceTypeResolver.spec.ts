import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  resolveSourceTypeByOrigId,
  resolveSourceTypesByOrigIds,
  macroFileTypeFromUserFileDoc,
} from '../../src/workers/utils/sourceTypeResolver';
import type { UserFileDoc } from '../../src/core/types/persistence/userFile.persistence';

describe('sourceTypeResolver', () => {
  const userId = 'user-1';

  let conversationService: { findDocById: ReturnType<typeof jest.fn> };
  let noteService: { getNoteDoc: ReturnType<typeof jest.fn> };
  let userFileService: { getActiveUserFileById: ReturnType<typeof jest.fn> };

  beforeEach(() => {
    conversationService = { findDocById: jest.fn(async () => null) };
    noteService = { getNoteDoc: jest.fn(async () => null) };
    userFileService = { getActiveUserFileById: jest.fn(async () => null) };
  });

  it('resolves chat when only conversation exists', async () => {
    conversationService.findDocById = jest.fn(async () => ({ _id: 'conv-1' }));
    const resolved = await resolveSourceTypeByOrigId('conv-1', userId, {
      conversationService: conversationService as never,
      noteService: noteService as never,
      userFileService: userFileService as never,
    });
    expect(resolved.sourceType).toBe('chat');
  });

  it('resolves file with hint for user_files', async () => {
    const doc = {
      _id: 'uf-1',
      displayName: 'slides.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    } as UserFileDoc;
    userFileService.getActiveUserFileById = jest.fn(async () => doc);

    const resolved = await resolveSourceTypeByOrigId('uf-1', userId, {
      conversationService: conversationService as never,
      noteService: noteService as never,
      userFileService: userFileService as never,
    });

    expect(resolved.sourceType).toBe('file');
    expect(resolved.userFileHint?.macroFileType).toBe('powerpoint');
  });

  it('throws when multiple sources match the same origId', async () => {
    conversationService.findDocById = jest.fn(async () => ({ _id: 'x' }));
    noteService.getNoteDoc = jest.fn(async () => ({ _id: 'x' }));

    await expect(
      resolveSourceTypeByOrigId('x', userId, {
        conversationService: conversationService as never,
        noteService: noteService as never,
        userFileService: userFileService as never,
      })
    ).rejects.toThrow('ambiguous');
  });

  it('batch resolver reports unresolved origIds', async () => {
    const batch = await resolveSourceTypesByOrigIds(['missing-id'], userId, {
      conversationService: conversationService as never,
      noteService: noteService as never,
      userFileService: userFileService as never,
    });
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
});
