/**
 * 목적: SyncService 유닛 테스트.
 * 접근: ConversationService, MessageService, NoteService를 모킹하여 동기화 로직 검증.
 */
import { SyncService } from '../../src/core/services/SyncService';
import { ConversationService } from '../../src/core/services/ConversationService';
import { MessageService } from '../../src/core/services/MessageService';
import { NoteService } from '../../src/core/services/NoteService';

// Mock MongoDB
jest.mock('../../src/infra/db/mongodb', () => ({
  getMongo: jest.fn().mockReturnValue({
    startSession: jest.fn().mockReturnValue({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      withTransaction: jest.fn(async (cb) => await cb()),
    }),
  }),
}));

describe('SyncService', () => {
  let service: SyncService;
  let mockConvSvc: jest.Mocked<ConversationService>;
  let mockMsgSvc: jest.Mocked<MessageService>;
  let mockNoteSvc: jest.Mocked<NoteService>;

  beforeEach(() => {
    mockConvSvc = {
      findModifiedSince: jest.fn(),
      createDoc: jest.fn(),
      updateDoc: jest.fn(),
      findDocById: jest.fn(),
    } as any;

    mockMsgSvc = {
      findModifiedSince: jest.fn(),
      createDoc: jest.fn(),
      updateDoc: jest.fn(),
      findDocById: jest.fn(),
    } as any;

    mockNoteSvc = {
      findNotesModifiedSince: jest.fn(),
      findFoldersModifiedSince: jest.fn(),
      createNoteDoc: jest.fn(),
      updateNoteDoc: jest.fn(),
      findNoteDocById: jest.fn(),
      createFolderDoc: jest.fn(),
      updateFolderDoc: jest.fn(),
      findFolderDocById: jest.fn(),
    } as any;

    service = new SyncService(mockConvSvc, mockMsgSvc, mockNoteSvc);
  });

  describe('pull', () => {
    it('should fetch modified data from all services', async () => {
      const userId = 'u1';
      const since = new Date();

      mockConvSvc.findModifiedSince.mockResolvedValue([]);
      mockMsgSvc.findModifiedSince.mockResolvedValue([]);
      mockNoteSvc.findNotesModifiedSince.mockResolvedValue([]);
      mockNoteSvc.findFoldersModifiedSince.mockResolvedValue([]);

      const result = await service.pull(userId, since);

      expect(result.conversations).toEqual([]);
      expect(mockConvSvc.findModifiedSince).toHaveBeenCalledWith(userId, since);
      expect(mockMsgSvc.findModifiedSince).toHaveBeenCalledWith(userId, since);
      expect(mockNoteSvc.findNotesModifiedSince).toHaveBeenCalledWith(userId, since);
    });
  });

  // Push test omitted for brevity but structure is ready
});
