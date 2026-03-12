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
      getNoteDoc: jest.fn(),
      createFolderDoc: jest.fn(),
      updateFolderDoc: jest.fn(),
      getFolderDoc: jest.fn(),
    } as any;

    service = new SyncService(mockConvSvc, mockMsgSvc, mockNoteSvc);
  });

  describe('pull', () => {
    it('should fetch modified data from all services and nest messages', async () => {
      const userId = 'u1';
      const since = new Date();

      const mockConv = { _id: 'c1', ownerUserId: userId, title: 'T1', createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null };
      const mockMsg = { _id: 'm1', conversationId: 'c1', ownerUserId: userId, role: 'user', content: 'Hello', createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null };

      mockConvSvc.findModifiedSince.mockResolvedValue([mockConv as any]);
      mockMsgSvc.findModifiedSince.mockResolvedValue([mockMsg as any]);
      mockNoteSvc.findNotesModifiedSince.mockResolvedValue([]);
      mockNoteSvc.findFoldersModifiedSince.mockResolvedValue([]);

      const result = await service.pull(userId, since);

      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].id).toBe('c1');
      expect(result.conversations[0].messages).toHaveLength(1);
      expect(result.conversations[0].messages[0].id).toBe('m1');
      expect(result.messages).toHaveLength(1);
      
      expect(mockConvSvc.findModifiedSince).toHaveBeenCalledWith(userId, since);
      expect(mockMsgSvc.findModifiedSince).toHaveBeenCalledWith(userId, since);
      expect(mockNoteSvc.findNotesModifiedSince).toHaveBeenCalledWith(userId, since);
    });
  });

  describe('push', () => {
    it('should process creates for conversations', async () => {
        const changes = {
            conversations: [
                { id: 'c1', title: 'New Conv', model: 'gpt-4', systemPrompt: '', temperature: 0.7, attachedFiles: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            ],
            lastPulledAt: new Date().toISOString()
        };
        
        await service.push('u1', changes as any);
        expect(mockConvSvc.createDoc).toHaveBeenCalled();
    });

    it('should process updates for messages', async () => {
       const changes = {
            messages: [
                // Minimal DTO shape
                { id: 'm1', conversationId: 'c1', role: 'user', content: 'Updated', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            ],
            lastPulledAt: new Date().toISOString()
        };
        
        // Mock finding existing message for conflict check
        mockMsgSvc.findDocById.mockResolvedValue({ id: 'm1', ownerUserId: 'u1', updatedAt: new Date(Date.now() - 10000) } as any);

        await service.push('u1', changes as any);
        expect(mockMsgSvc.updateDoc).toHaveBeenCalled();
    });

    it('should ignore stale updates (LWW)', async () => {
         const changes = {
            notes: [
                { id: 'n1', title: 'Old', content: '', createdAt: new Date().toISOString(), updatedAt: new Date(Date.now() - 20000).toISOString() }
            ],
            lastPulledAt: new Date().toISOString()
        };

        // Existing note is newer
        mockNoteSvc.getNoteDoc.mockResolvedValue({ id: 'n1', ownerUserId: 'u1', updatedAt: new Date(Date.now() - 5000) } as any);

        await service.push('u1', changes as any);
        expect(mockNoteSvc.updateNoteDoc).not.toHaveBeenCalled();
    });
  });
});
