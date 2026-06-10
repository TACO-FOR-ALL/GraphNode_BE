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
      findWorkspaceByDocumentId: jest.fn(),
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
      upload: jest.fn(),
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
      getUserProfile: jest.fn().mockImplementation(() => Promise.resolve({ preferredLanguage: 'ko' })),
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
          payload: expect.objectContaining({
            user_id: userId,
            node_id: nodeId,
            node_type: nodeType,
            group_id: createdWorkspaceId,
            schema_name: schemaName,
            language: 'ko',
            ingest_mode: 'from_graphnode',
            block_mode: false,
          }),
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

  describe('resolveGroupIdForIngestResult', () => {
    it('returns group_id from payload when present', async () => {
      const groupId = await service.resolveGroupIdForIngestResult(
        'user_1',
        'task_doc_1',
        'ws-from-payload'
      );
      expect(groupId).toBe('ws-from-payload');
      expect(mockWorkspaceStore.findWorkspaceByDocumentId).not.toHaveBeenCalled();
    });

    it('falls back to Mongo lookup by docId when group_id is missing', async () => {
      mockWorkspaceStore.findWorkspaceByDocumentId.mockResolvedValue({
        _id: 'ws-from-db',
        userId: 'user_1',
        documents: [{ id: 'task_doc_1', status: 'PROCESSING' }],
      } as any);

      const groupId = await service.resolveGroupIdForIngestResult('user_1', 'task_doc_1');

      expect(mockWorkspaceStore.findWorkspaceByDocumentId).toHaveBeenCalledWith('user_1', 'task_doc_1');
      expect(groupId).toBe('ws-from-db');
    });

    it('parses userId from taskId when userId argument is omitted', async () => {
      const docId = 'task_microscope_node_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5';
      mockWorkspaceStore.findWorkspaceByDocumentId.mockResolvedValue({
        _id: 'ws-from-task',
        userId: 'user-12345',
        documents: [{ id: docId, status: 'PROCESSING' }],
      } as any);

      const groupId = await service.resolveGroupIdForIngestResult(undefined, docId);

      expect(mockWorkspaceStore.findWorkspaceByDocumentId).toHaveBeenCalledWith('user-12345', docId);
      expect(groupId).toBe('ws-from-task');
    });

    it('throws NotFoundError when group_id and doc lookup both fail', async () => {
      mockWorkspaceStore.findWorkspaceByDocumentId.mockResolvedValue(null);

      await expect(
        service.resolveGroupIdForIngestResult('user_1', 'missing_task')
      ).rejects.toThrow(NotFoundError);
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

  describe('ingestRawDocumentsToWorkspace', () => {
    it('uploads raw file to S3, adds document meta, and enqueues SQS message', async () => {
      const userId = 'user-123';
      const groupId = 'ws-1';
      const workspace = { _id: groupId, userId, documents: [] as any[] };
      mockWorkspaceStore.findById.mockResolvedValue(workspace as any);

      mockStoragePort.upload.mockResolvedValue(undefined);
      mockQueuePort.sendMessage.mockResolvedValue(undefined);
      mockWorkspaceStore.addDocument.mockResolvedValue(undefined);
      mockNotificationSvc.sendMicroscopeIngestRequested.mockResolvedValue(undefined as any);

      const out = await service.ingestRawDocumentsToWorkspace(
        userId,
        groupId,
        [
          {
            buffer: Buffer.from('PDF'),
            originalname: 'report.pdf',
            mimetype: 'application/pdf',
          },
        ],
        'schema-a'
      );

      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^microscope-ingest/${userId}/task_microscope_file_${userId}_.+/report\\.pdf$`)),
        expect.any(Buffer),
        'application/pdf',
        expect.objectContaining({ bucketType: 'payload' })
      );
      expect(mockWorkspaceStore.addDocument).toHaveBeenCalledWith(groupId, expect.any(Object));
      expect(mockQueuePort.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          taskType: TaskType.MICROSCOPE_INGEST_REQUEST,
          payload: expect.objectContaining({
            user_id: userId,
            group_id: groupId,
            schema_name: 'schema-a',
            file_name: 'report.pdf',
            ingest_mode: 'raw_file',
            block_mode: false,
          }),
        })
      );
      expect(out._id).toBe(groupId);
      expect(out.documents.length).toBe(1);
    });

    it('throws ValidationError when files array is empty', async () => {
      await expect(service.ingestRawDocumentsToWorkspace('u', 'ws', [])).rejects.toThrow(ValidationError);
    });
  });
});
