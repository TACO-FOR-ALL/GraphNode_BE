import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { MicroscopeManagementService } from '../../src/core/services/MicroscopeManagementService';
import { MicroscopeWorkspaceStore } from '../../src/core/ports/MicroscopeWorkspaceStore';
import { GraphNeo4jStore } from '../../src/core/ports/GraphNeo4jStore';
import { QueuePort } from '../../src/core/ports/QueuePort';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { ConversationRepository } from '../../src/core/ports/ConversationRepository';
import { NoteRepository } from '../../src/core/ports/NoteRepository';
import { NotificationService } from '../../src/core/services/NotificationService';
import { TaskType } from '../../src/shared/dtos/queue';
import { NotFoundError, ValidationError } from '../../src/shared/errors/domain';
import { UserService } from '../../src/core/services/UserService';

describe('MicroscopeManagementService', () => {
  let service: MicroscopeManagementService;
  let mockWorkspaceStore: jest.Mocked<MicroscopeWorkspaceStore>;
  let mockGraphNeo4jStore: jest.Mocked<GraphNeo4jStore>;
  let mockQueuePort: jest.Mocked<QueuePort>;
  let mockStoragePort: jest.Mocked<StoragePort>;
  let mockConversationRepo: jest.Mocked<ConversationRepository>;
  let mockNoteRepo: jest.Mocked<NoteRepository>;
  let mockNotificationSvc: jest.Mocked<NotificationService>;
  let mockUserService: jest.Mocked<UserService>;

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
      findLatestWorkspaceByNodeId: jest.fn(),
      findWorkspaceByMostRecentDocumentNodeId: jest.fn(),
    } as any;

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
    } as any;

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
    } as any;

    mockNotificationSvc = {
      sendMicroscopeIngestRequested: jest.fn(),
      sendMicroscopeIngestRequestFailed: jest.fn(),
      sendNotification: jest.fn(),
    } as any;

    mockUserService = {
      getUserProfile: jest.fn().mockResolvedValue({ preferredLanguage: 'ko' }),
    } as any;

    service = new MicroscopeManagementService(
      mockWorkspaceStore,
      mockGraphNeo4jStore,
      mockQueuePort,
      mockStoragePort,
      mockConversationRepo,
      mockNoteRepo,
      mockNotificationSvc,
      mockUserService
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
        status: 'PROCESSING',
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

  describe('getLatestWorkspaceByNodeId', () => {
    const userId = 'user_test';
    const nodeId = 'note_abc';

    const mockWorkspace = {
      _id: 'ws_latest',
      userId,
      name: 'Test Note',
      documents: [
        {
          id: 'doc_1',
          s3Key: '',
          fileName: `${nodeId}.md`,
          status: 'PROCESSING' as const,
          nodeId,
          nodeType: 'note' as const,
          createdAt: '2026-04-09T10:00:00Z',
          updatedAt: '2026-04-09T10:00:00Z',
        },
      ],
      createdAt: '2026-04-09T10:00:00Z',
      updatedAt: '2026-04-09T10:00:00Z',
    };

    it('should return workspace when found', async () => {
      // Arrange
      mockWorkspaceStore.findWorkspaceByMostRecentDocumentNodeId.mockResolvedValue(mockWorkspace as any);

      // Act
      const result = await service.getLatestWorkspaceByNodeId(userId, nodeId);

      // Assert
      expect(mockWorkspaceStore.findWorkspaceByMostRecentDocumentNodeId).toHaveBeenCalledWith(
        userId,
        nodeId
      );
      expect(result._id).toBe('ws_latest');
      expect(result.documents[0].nodeId).toBe(nodeId);
      expect(result.documents[0].status).toBe('PROCESSING');
    });

    it('should throw NotFoundError when no workspace exists for nodeId', async () => {
      // Arrange
      mockWorkspaceStore.findWorkspaceByMostRecentDocumentNodeId.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getLatestWorkspaceByNodeId(userId, nodeId)).rejects.toThrow(
        NotFoundError
      );
      expect(mockWorkspaceStore.findWorkspaceByMostRecentDocumentNodeId).toHaveBeenCalledWith(
        userId,
        nodeId
      );
    });

    it('should return most recently requested workspace among multiple ingest requests', async () => {
      // Arrange: 동일 nodeId로 2번 ingest 요청 → 최신(createdAt 기준) workspace 반환
      const newerWorkspace = {
        ...mockWorkspace,
        _id: 'ws_newer',
        documents: [
          {
            ...mockWorkspace.documents[0],
            id: 'doc_newer',
            status: 'PROCESSING' as const,
            createdAt: '2026-04-09T12:00:00Z', // 더 최신
          },
        ],
      };

      // Repository가 aggregation으로 이미 정렬된 결과를 반환한다고 가정
      mockWorkspaceStore.findWorkspaceByMostRecentDocumentNodeId.mockResolvedValue(
        newerWorkspace as any
      );

      // Act
      const result = await service.getLatestWorkspaceByNodeId(userId, nodeId);

      // Assert: 최신 워크스페이스가 반환됨
      expect(result._id).toBe('ws_newer');
      expect(result.documents[0].id).toBe('doc_newer');
    });
  });
});
