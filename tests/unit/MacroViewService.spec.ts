import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import { MacroViewService } from '../../src/core/services/MacroViewService';
import type { MacroGraphStore } from '../../src/core/ports/MacroGraphStore';
import type { QueuePort } from '../../src/core/ports/QueuePort';
import type { StoragePort } from '../../src/core/ports/StoragePort';
import type { ConversationRepository } from '../../src/core/ports/ConversationRepository';
import type { NoteRepository } from '../../src/core/ports/NoteRepository';
import type { UserFileRepository } from '../../src/core/ports/UserFileRepository';
import type { NotionCacheRepository } from '../../src/core/ports/NotionCacheRepository';
import { ValidationError, NotFoundError } from '../../src/shared/errors/domain';
import { TaskType } from '../../src/shared/dtos/queue';

const USER = 'user-1';
const MACRO_ID = 'test-macro-id';

const mockView = {
  macroId: MACRO_ID,
  userId: USER,
  title: '테스트 뷰',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function makeMocks() {
  const macroGraphStore = {
    listMacroViews: jest.fn<MacroGraphStore['listMacroViews']>(),
    getMacroView: jest.fn<MacroGraphStore['getMacroView']>(),
    createMacroView: jest.fn<MacroGraphStore['createMacroView']>(),
    updateMacroView: jest.fn<MacroGraphStore['updateMacroView']>(),
    cloneMacroGraph: jest.fn<MacroGraphStore['cloneMacroGraph']>(),
    softDeleteMacroView: jest.fn<MacroGraphStore['softDeleteMacroView']>(),
    restoreMacroView: jest.fn<MacroGraphStore['restoreMacroView']>(),
  } as unknown as jest.Mocked<MacroGraphStore>;

  const queuePort = {
    sendMessage: jest.fn<QueuePort['sendMessage']>(),
  } as unknown as jest.Mocked<QueuePort>;

  const storagePort = {
    uploadJson: jest.fn<StoragePort['uploadJson']>(),
  } as unknown as jest.Mocked<StoragePort>;

  const conversationRepo = {
    findModifiedSince: jest.fn(async () => [{ _id: 'conv-1' }]),
  } as unknown as jest.Mocked<ConversationRepository>;

  const noteRepo = {
    findNotesModifiedSince: jest.fn(async () => [{ _id: 'note-1' }]),
  } as unknown as jest.Mocked<NoteRepository>;

  const userFileRepo = {
    listAllActive: jest.fn(async () => [{ _id: 'file-1' }]),
    findModifiedSince: jest.fn(async () => [{ _id: 'file-2' }]),
  } as unknown as jest.Mocked<UserFileRepository>;

  const notionCacheRepo = {
    findPagesModifiedSince: jest.fn(async () => [{ _id: 'notion-1' }]),
  } as unknown as jest.Mocked<NotionCacheRepository>;

  return { macroGraphStore, queuePort, storagePort, conversationRepo, noteRepo, userFileRepo, notionCacheRepo };
}

describe('MacroViewService', () => {
  let service: MacroViewService;
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    process.env.SQS_REQUEST_QUEUE_URL = 'https://sqs.example.com/queue';
    process.env.S3_PAYLOAD_BUCKET = 'test-bucket';
    mocks = makeMocks();
    service = new MacroViewService(
      mocks.macroGraphStore,
      mocks.queuePort,
      mocks.storagePort,
      mocks.conversationRepo,
      mocks.noteRepo,
      mocks.userFileRepo,
      mocks.notionCacheRepo
    );
  });

  describe('listMacroViews', () => {
    it('throws ValidationError if userId is empty', async () => {
      await expect(service.listMacroViews('')).rejects.toThrow(ValidationError);
    });

    it('delegates to store and returns result', async () => {
      mocks.macroGraphStore.listMacroViews.mockResolvedValue([mockView]);
      const result = await service.listMacroViews(USER);
      expect(mocks.macroGraphStore.listMacroViews).toHaveBeenCalledWith(USER, undefined);
      expect(result).toHaveLength(1);
    });

    it('passes query options to store', async () => {
      mocks.macroGraphStore.listMacroViews.mockResolvedValue([]);
      await service.listMacroViews(USER, { sortBy: 'createdAt', onlyDeleted: true });
      expect(mocks.macroGraphStore.listMacroViews).toHaveBeenCalledWith(USER, {
        sortBy: 'createdAt',
        onlyDeleted: true,
      });
    });
  });

  describe('getMacroView', () => {
    it('throws ValidationError if userId is empty', async () => {
      await expect(service.getMacroView('', MACRO_ID)).rejects.toThrow(ValidationError);
    });

    it('returns null if view does not exist', async () => {
      mocks.macroGraphStore.getMacroView.mockResolvedValue(null);
      const result = await service.getMacroView(USER, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns view if found', async () => {
      mocks.macroGraphStore.getMacroView.mockResolvedValue(mockView);
      const result = await service.getMacroView(USER, MACRO_ID);
      expect(result?.macroId).toBe(MACRO_ID);
    });
  });

  describe('createMacroView — AUTO 모드', () => {
    const autoDto = {
      title: '자동 뷰',
      scopeFilter: { mode: 'auto' as const, intent: 'RAG 연구' },
    };

    beforeEach(() => {
      mocks.macroGraphStore.createMacroView.mockResolvedValue(mockView);
      mocks.storagePort.uploadJson.mockResolvedValue(undefined);
      mocks.queuePort.sendMessage.mockResolvedValue(undefined);
    });

    it('creates MacroGraph root node in Neo4j', async () => {
      await service.createMacroView(USER, autoDto);
      expect(mocks.macroGraphStore.createMacroView).toHaveBeenCalledWith(
        USER,
        expect.any(String),
        expect.objectContaining({ title: '자동 뷰', scopeFilter: autoDto.scopeFilter })
      );
    });

    it('uploads data IDs to S3 for AUTO mode (all data)', async () => {
      await service.createMacroView(USER, autoDto);
      expect(mocks.storagePort.uploadJson).toHaveBeenCalledWith(
        expect.stringMatching(/^macro-auto\/.+\/data_ids\.json$/),
        expect.objectContaining({
          conversations: ['conv-1'],
          notes: ['note-1'],
          files: ['file-1'],
          notionPages: ['notion-1'],
        })
      );
    });

    it('sends MACRO_GRAPH_AUTO_REQUEST to SQS with taskId === macroId', async () => {
      await service.createMacroView(USER, autoDto);
      const [queueUrl, message] = mocks.queuePort.sendMessage.mock.calls[0];
      expect(queueUrl).toBe('https://sqs.example.com/queue');
      expect((message as any).taskType).toBe(TaskType.MACRO_GRAPH_AUTO_REQUEST);
      expect((message as any).taskId).toBe((message as any).payload.macroId);
      expect((message as any).payload.scopeFilter).toEqual(autoDto.scopeFilter);
    });

    it('throws ValidationError if userId is empty', async () => {
      await expect(service.createMacroView('', autoDto)).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError if AUTO mode intent is empty', async () => {
      await expect(
        service.createMacroView(USER, { scopeFilter: { mode: 'auto', intent: '' } })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('createMacroView — MANUAL 모드', () => {
    const manualDto = {
      scopeFilter: {
        mode: 'manual' as const,
        filters: { dataTypes: ['chat', 'file'] as ('chat' | 'file')[], createdPeriod: '1m' as const },
      },
    };

    beforeEach(() => {
      mocks.macroGraphStore.createMacroView.mockResolvedValue(mockView);
      mocks.storagePort.uploadJson.mockResolvedValue(undefined);
      mocks.queuePort.sendMessage.mockResolvedValue(undefined);
    });

    it('collects only specified dataTypes for MANUAL mode', async () => {
      await service.createMacroView(USER, manualDto);
      expect(mocks.conversationRepo.findModifiedSince).toHaveBeenCalled();
      expect(mocks.userFileRepo.findModifiedSince).toHaveBeenCalled();
      expect(mocks.noteRepo.findNotesModifiedSince).not.toHaveBeenCalled();
      expect(mocks.notionCacheRepo.findPagesModifiedSince).not.toHaveBeenCalled();
    });

    it('uploads filtered data IDs to S3', async () => {
      await service.createMacroView(USER, manualDto);
      expect(mocks.storagePort.uploadJson).toHaveBeenCalledWith(
        expect.stringMatching(/^macro-auto\/.+\/data_ids\.json$/),
        expect.objectContaining({
          conversations: ['conv-1'],
          files: ['file-2'],
          notes: [],
          notionPages: [],
        })
      );
    });

    it('throws ValidationError if MANUAL mode has no dataTypes', async () => {
      await expect(
        service.createMacroView(USER, {
          scopeFilter: { mode: 'manual', filters: { dataTypes: [] } },
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateMacroView', () => {
    it('throws ValidationError if macroId is empty', async () => {
      await expect(service.updateMacroView(USER, '', { title: 'x' })).rejects.toThrow(ValidationError);
    });

    it('delegates patch to store', async () => {
      mocks.macroGraphStore.updateMacroView.mockResolvedValue({ ...mockView, title: '수정됨' });
      const result = await service.updateMacroView(USER, MACRO_ID, { title: '수정됨' });
      expect(mocks.macroGraphStore.updateMacroView).toHaveBeenCalledWith(USER, MACRO_ID, { title: '수정됨' });
      expect(result.title).toBe('수정됨');
    });
  });

  describe('cloneMacroView', () => {
    it('throws NotFoundError if source view does not exist', async () => {
      mocks.macroGraphStore.getMacroView.mockResolvedValue(null);
      await expect(service.cloneMacroView(USER, 'nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('creates new view with [복사본] title and clones graph', async () => {
      mocks.macroGraphStore.getMacroView
        .mockResolvedValueOnce({ ...mockView, scopeFilter: { mode: 'auto', intent: '연구' } })
        .mockResolvedValueOnce({ ...mockView, macroId: 'new-id', title: '[복사본] 테스트 뷰' });
      mocks.macroGraphStore.createMacroView.mockResolvedValue({ ...mockView, macroId: 'new-id' });
      mocks.macroGraphStore.cloneMacroGraph.mockResolvedValue(undefined);

      const result = await service.cloneMacroView(USER, MACRO_ID);

      expect(mocks.macroGraphStore.createMacroView).toHaveBeenCalledWith(
        USER,
        expect.any(String),
        expect.objectContaining({ title: '[복사본] 테스트 뷰' })
      );
      expect(mocks.macroGraphStore.cloneMacroGraph).toHaveBeenCalledWith(USER, MACRO_ID, expect.any(String));
      expect(result.macroId).toBe('new-id');
    });
  });

  describe('softDeleteMacroView', () => {
    it('delegates to store', async () => {
      mocks.macroGraphStore.softDeleteMacroView.mockResolvedValue(undefined);
      await service.softDeleteMacroView(USER, MACRO_ID);
      expect(mocks.macroGraphStore.softDeleteMacroView).toHaveBeenCalledWith(USER, MACRO_ID);
    });

    it('throws ValidationError if macroId is empty', async () => {
      await expect(service.softDeleteMacroView(USER, '')).rejects.toThrow(ValidationError);
    });
  });

  describe('restoreMacroView', () => {
    it('delegates to store', async () => {
      mocks.macroGraphStore.restoreMacroView.mockResolvedValue(undefined);
      await service.restoreMacroView(USER, MACRO_ID);
      expect(mocks.macroGraphStore.restoreMacroView).toHaveBeenCalledWith(USER, MACRO_ID);
    });

    it('throws ValidationError if macroId is empty', async () => {
      await expect(service.restoreMacroView(USER, '')).rejects.toThrow(ValidationError);
    });
  });
});
