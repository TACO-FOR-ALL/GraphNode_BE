import { MicroscopeManagementService } from '../../src/core/services/MicroscopeManagementService';
import { MicroscopeWorkspaceStore } from '../../src/core/ports/MicroscopeWorkspaceStore';
import { GraphNeo4jStore } from '../../src/core/ports/GraphNeo4jStore';
import { QueuePort } from '../../src/core/ports/QueuePort';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { ConversationRepository } from '../../src/core/ports/ConversationRepository';
import { NoteRepository } from '../../src/core/ports/NoteRepository';
import { TaskType } from '../../src/shared/dtos/queue';
import { NotFoundError, ValidationError } from '../../src/shared/errors/domain';

describe('MicroscopeManagementService', () => {
  let service: MicroscopeManagementService;
  let mockWorkspaceStore: jest.Mocked<MicroscopeWorkspaceStore>;
  let mockGraphNeo4jStore: jest.Mocked<GraphNeo4jStore>;
  let mockQueuePort: jest.Mocked<QueuePort>;
  let mockStoragePort: jest.Mocked<StoragePort>;
  let mockConversationRepo: jest.Mocked<ConversationRepository>;
  let mockNoteRepo: jest.Mocked<NoteRepository>;

  beforeEach(() => {
    mockWorkspaceStore = {
      createWorkspace: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      deleteWorkspace: jest.fn(),
      addDocument: jest.fn(),
      updateDocumentStatus: jest.fn(),
      saveGraphPayload: jest.fn(),
      findGraphPayloadsByIds: jest.fn(),
      deleteGraphPayloadsByGroupId: jest.fn(),
    };

    mockGraphNeo4jStore = {
      saveGraph: jest.fn(),
      deleteGraphByGroupId: jest.fn(),
      findGraphByGroupId: jest.fn(),
    } as any;
    
    mockQueuePort = {
      sendMessage: jest.fn(),
      receiveMessages: jest.fn(),
      deleteMessage: jest.fn(),
    } as any;

    mockStoragePort = {
      uploadFile: jest.fn(),
      downloadFile: jest.fn(),
      deleteFile: jest.fn(),
      getDownloadUrl: jest.fn(),
    } as any;

    mockConversationRepo = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      deleteAll: jest.fn(),
      listByOwner: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      softDelete: jest.fn(),
      hardDelete: jest.fn(),
      restore: jest.fn(),
      findModifiedSince: jest.fn(),
    };

    mockNoteRepo = {
      createNote: jest.fn(),
      getNote: jest.fn(),
      listNotes: jest.fn(),
      updateNote: jest.fn(),
      deleteNote: jest.fn(),
      deleteAllNotes: jest.fn(),
      deleteAllNotesInFolders: jest.fn(),
      softDeleteNote: jest.fn(),
      hardDeleteNote: jest.fn(),
      restoreNote: jest.fn(),
      findNotesModifiedSince: jest.fn(),
      findFoldersModifiedSince: jest.fn(),
      deleteNotesByFolderIds: jest.fn(),
      softDeleteNotesByFolderIds: jest.fn(),
      hardDeleteNotesByFolderIds: jest.fn(),
      restoreNotesByFolderIds: jest.fn(),
      createFolder: jest.fn(),
      getFolder: jest.fn(),
      listFolders: jest.fn(),
      updateFolder: jest.fn(),
      deleteFolder: jest.fn(),
      findDescendantFolderIds: jest.fn(),
      deleteFolders: jest.fn(),
      softDeleteFolders: jest.fn(),
      hardDeleteFolders: jest.fn(),
      restoreFolder: jest.fn(),
      restoreFolders: jest.fn(),
      deleteAllFolders: jest.fn(),
    };

    service = new MicroscopeManagementService(
      mockWorkspaceStore,
      mockGraphNeo4jStore,
      mockQueuePort,
      mockStoragePort,
      mockConversationRepo,
      mockNoteRepo
    );
  });

  describe('createWorkspaceAndMicroscopeIngestFromNode', () => {
    it('should create workspace, document with nodeId/nodeType, and send SQS message', async () => {
      // Arrange
      const userId = 'user_123';
      const nodeId = 'note_456';
      const nodeType = 'note';
      const schemaName = 'test_schema';

      mockNoteRepo.getNote.mockResolvedValue({ id: nodeId, title: 'My Note' } as any);
      
      let createdWorkspaceId = '';
      mockWorkspaceStore.createWorkspace.mockImplementation(async (workspace) => {
        createdWorkspaceId = workspace._id;
      });

      // Act
      const result = await service.createWorkspaceAndMicroscopeIngestFromNode(
        userId,
        nodeId,
        nodeType,
        schemaName
      );

      // Assert
      expect(mockNoteRepo.getNote).toHaveBeenCalledWith(nodeId, userId);
      expect(mockWorkspaceStore.createWorkspace).toHaveBeenCalled();
      
      const addedDocument = mockWorkspaceStore.addDocument.mock.calls[0][1];
      expect(mockWorkspaceStore.addDocument).toHaveBeenCalledWith(createdWorkspaceId, expect.any(Object));
      expect(addedDocument).toMatchObject({
        fileName: `${nodeId}.md`,
        status: 'PENDING',
        nodeId: nodeId,
        nodeType: nodeType
      });

      expect(mockQueuePort.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_REQUEST,
          payload: {
            user_id: userId,
            node_id: nodeId,
            node_type: nodeType,
            group_id: createdWorkspaceId,
            schema_name: schemaName,
          }
        })
      );
      expect(result._id).toBe(createdWorkspaceId);
    });

    it('should throw NotFoundError if note is not found', async () => {
      // Arrange
      const userId = 'user_123';
      const nodeId = 'note_456';
      mockNoteRepo.getNote.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createWorkspaceAndMicroscopeIngestFromNode(userId, nodeId, 'note')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError if conversation is not found', async () => {
      // Arrange
      const userId = 'user_123';
      const convId = 'conv_456';
      mockConversationRepo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createWorkspaceAndMicroscopeIngestFromNode(userId, convId, 'conversation')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for invalid node type', async () => {
       // Act & Assert
       await expect(
        service.createWorkspaceAndMicroscopeIngestFromNode('user', 'id', 'invalid' as any)
      ).rejects.toThrow(ValidationError);
    });
  });
});
