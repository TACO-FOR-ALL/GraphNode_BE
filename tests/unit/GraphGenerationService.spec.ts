/**
 * 목적: GraphGenerationService 유닛 테스트.
 * 접근: 외부 의존성(ChatManagementService, GraphEmbeddingService, HttpClient)을 모킹하여 로직 검증.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { GraphGenerationService } from '../../src/core/services/GraphGenerationService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import { HttpClient } from '../../src/infra/http/httpClient';
import { QueuePort } from '../../src/core/ports/QueuePort';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { UserService } from '../../src/core/services/UserService';
import { NoteService } from '../../src/core/services/NoteService';
import { UserFileService } from '../../src/core/services/UserFileService';
import { NotificationService } from '../../src/core/services/NotificationService';

// Mock HttpClient
jest.mock('../../src/infra/http/httpClient');
jest.mock('../../src/shared/mappers/graph_ai_input.mapper', () => ({
  mapSnapshotToAiInput: jest.fn().mockReturnValue({ nodes: [], edges: [] }),
}));

describe('GraphGenerationService', () => {
  let service: GraphGenerationService;
  let mockChatSvc: jest.Mocked<ChatManagementService>;
  let mockGraphEmbSvc: jest.Mocked<GraphEmbeddingService>;
  let mockHttpClient: jest.Mocked<HttpClient>;
  let mockQueuePort: jest.Mocked<QueuePort>;
  let mockStoragePort: jest.Mocked<StoragePort>;
  let mockUserSvc: jest.Mocked<UserService>;
  let mockNoteSvc: jest.Mocked<NoteService>;
  let mockUserFileSvc: jest.Mocked<UserFileService>;
  let mockNotificationSvc: jest.Mocked<NotificationService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();


    // Create mocks
    mockChatSvc = {
      listConversations: jest.fn(),
      getMessages: jest.fn(),
    } as any;

    mockGraphEmbSvc = {
      persistSnapshot: jest.fn(),
      getSnapshotForUser: jest.fn(), // Added default mock
      getStats: jest.fn(),
      saveStats: jest.fn(),
      listClusters: jest.fn<any>().mockResolvedValue([]),
    } as any;

    mockUserSvc = {
      findById: jest.fn(),
      getPreferredLanguage: jest.fn<any>().mockResolvedValue('ko'),
    } as any;

    mockNoteSvc = {
      findNotesModifiedSince: jest.fn<any>().mockResolvedValue([]),
    } as any;

    mockUserFileSvc = {
      listAllActiveFiles: jest.fn<any>().mockResolvedValue([]),
      findFilesModifiedSince: jest.fn<any>().mockResolvedValue([]),
    } as any;

    mockNotificationSvc = {
      sendTaskCompleted: jest.fn(),
      sendTaskFailed: jest.fn(),
      sendNotification: jest.fn(),
      sendGraphGenerationRequested: jest.fn(),
      sendGraphGenerationRequestFailed: jest.fn(),
      sendGraphSummaryRequested: jest.fn(),
      sendGraphSummaryRequestFailed: jest.fn(),
      sendAddConversationRequested: jest.fn(),
      sendAddConversationRequestFailed: jest.fn(),
    } as any;

    mockQueuePort = {
      sendMessage: jest.fn(),
      receiveMessages: jest.fn(),
      deleteMessage: jest.fn(),
    } as any;

    mockStoragePort = {
      upload: jest.fn(),
      downloadFile: jest.fn(),
      deleteFile: jest.fn(),
      getSignedUrl: jest.fn(),
    } as any;

    // Mock upload to consume stream
    mockStoragePort.upload.mockImplementation(async (key: any, body: any, contentType: any) => {
      // Force consumption for Readable streams
      if (body && typeof body.on === 'function') {
        body.on('data', () => {}); // Consume stream
        await new Promise<void>((resolve, reject) => {
            body.on('end', resolve);
            body.on('error', reject);
            body.on('close', resolve);
        });
      }
    });

    // HttpClient mock instance
    mockHttpClient = {
      post: jest.fn().mockImplementation(async (url: any, data: any) => {
        // Stream must be consumed to trigger listConversations
        // Use a more robust consumption for Readable streams
        if (data && typeof data.on === 'function') {
          data.resume(); // Start flowing
          await new Promise((resolve) => data.on('end', resolve));
        } else if (data && typeof data[Symbol.asyncIterator] === 'function') {
          for await (const _ of data) { /* consume */ }
        }
        return { task_id: 'task1', status: 'processing' };
      }),
      get: jest.fn(),
    } as any;
    (HttpClient as jest.Mock).mockImplementation(() => mockHttpClient);

    service = new GraphGenerationService(
      mockChatSvc,
      mockGraphEmbSvc,
      mockNoteSvc,
      mockUserFileSvc,
      mockUserSvc,
      mockQueuePort,
      mockStoragePort,
      mockNotificationSvc
    );

    // Use fake timers to control polling
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('requestGraphSummary', () => {
    const userId = 'user1';

    it('should request summary successfully', async () => {
      // Arrange
      const snapshot = { nodes: [{ id: 1 }] };
      (mockGraphEmbSvc.getSnapshotForUser as jest.Mock).mockReturnValue(Promise.resolve(snapshot));
      mockStoragePort.upload.mockResolvedValue(undefined);
      mockQueuePort.sendMessage.mockResolvedValue(undefined);

      // Act
      const taskId = await service.requestGraphSummary(userId);

      // Assert
      expect(taskId).toContain('summary_user1');
      expect(mockGraphEmbSvc.getSnapshotForUser).toHaveBeenCalledWith(userId);
      expect(mockStoragePort.upload).toHaveBeenCalled();
      expect(mockQueuePort.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          taskType: 'GRAPH_SUMMARY_REQUEST',
          payload: expect.objectContaining({ userId }),
        })
      );
    });

    it('should throw Error if snapshot not found', async () => {
      (mockGraphEmbSvc.getSnapshotForUser as jest.Mock).mockReturnValue(Promise.resolve(null));

      await expect(service.requestGraphSummary(userId)).rejects.toThrow();
    });
  });

  describe('requestGraphGenerationViaQueue', () => {
    const userId = 'user1';

    it('should return null and skip operations if no conversation and no note data found', async () => {
      // Arrange
      mockChatSvc.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
      });
      mockNoteSvc.findNotesModifiedSince.mockResolvedValue([]);
      mockUserFileSvc.listAllActiveFiles.mockResolvedValue([]);

      // Act
      const result = await service.requestGraphGenerationViaQueue(userId);

      // Assert
      expect(result).toBeNull();
      expect(mockStoragePort.upload).not.toHaveBeenCalled();
      expect(mockQueuePort.sendMessage).not.toHaveBeenCalled();
      expect(mockGraphEmbSvc.saveStats).not.toHaveBeenCalled();
    });

    it('should upload data to S3 and send SQS message', async () => {
      // Arrange
      mockChatSvc.listConversations.mockResolvedValue({
        items: [{ id: 'c1', title: 'T1', messages: [] } as any],
        nextCursor: null,
      });
      mockUserFileSvc.listAllActiveFiles.mockResolvedValue([]);
      mockQueuePort.sendMessage.mockResolvedValue(undefined);
      mockGraphEmbSvc.saveStats.mockResolvedValue(undefined);

      // Act
      const taskId = await service.requestGraphGenerationViaQueue(userId);

      // Assert
      expect(taskId).toContain('task_user1_');
      expect(mockChatSvc.listConversations).toHaveBeenCalled();
      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        expect.stringContaining('graph-generation/'),
        expect.anything(),
        'application/json'
      );
      expect(mockQueuePort.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          payload: expect.objectContaining({
            userId,
            bucket: process.env.S3_PAYLOAD_BUCKET,
            s3Key: expect.stringMatching(/graph-generation\/task_user1_[^/]+\/$/),
            inputType: 'auto',
            minClusters: 3,
            maxClusters: 8,
          }),
        })
      );
      const sent = mockQueuePort.sendMessage.mock.calls[0][1] as { payload: { extraS3Keys?: string[] } };
      expect(sent.payload.extraS3Keys).toBeUndefined();
      expect(mockGraphEmbSvc.saveStats).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CREATING' })
      );
    });

    it('should upload notes.json into bundle prefix when only notes exist', async () => {
      // Arrange
      mockChatSvc.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
      });
      mockUserFileSvc.listAllActiveFiles.mockResolvedValue([]);
      mockNoteSvc.findNotesModifiedSince.mockResolvedValue([
        {
          _id: 'n1',
          title: 'Note 1',
          content: 'Content 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any
      ]);
      mockQueuePort.sendMessage.mockResolvedValue(undefined);
      mockGraphEmbSvc.saveStats.mockResolvedValue(undefined);

      // Act
      await service.requestGraphGenerationViaQueue(userId);

      // Assert
      expect(mockNoteSvc.findNotesModifiedSince).toHaveBeenCalled();
      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        expect.stringContaining('notes.json'),
        expect.anything(),
        'application/json'
      );
      expect(mockQueuePort.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          payload: expect.objectContaining({
            s3Key: expect.stringMatching(/graph-generation\/task_user1_[^/]+\/$/),
          }),
        })
      );
      const sent = mockQueuePort.sendMessage.mock.calls[0][1] as { payload: { extraS3Keys?: string[] } };
      expect(sent.payload.extraS3Keys).toBeUndefined();
    });

    it('should copy user library files into bundle files/ prefix', async () => {
      mockChatSvc.listConversations.mockResolvedValue({
        items: [{ id: 'c1', title: 'T1', messages: [] } as any],
        nextCursor: null,
      });
      mockUserFileSvc.listAllActiveFiles.mockResolvedValue([
        {
          _id: 'uf1',
          displayName: 'report.pdf',
          s3Key: 'user-files/user1/uf1.pdf',
          mimeType: 'application/pdf',
          updatedAt: new Date(),
        } as any,
      ]);
      mockStoragePort.downloadFile.mockResolvedValue({
        buffer: Buffer.from('%PDF-1.1'),
        contentType: 'application/pdf',
      });
      mockQueuePort.sendMessage.mockResolvedValue(undefined);
      mockGraphEmbSvc.saveStats.mockResolvedValue(undefined);

      await service.requestGraphGenerationViaQueue(userId);

      expect(mockStoragePort.downloadFile).toHaveBeenCalledWith('user-files/user1/uf1.pdf', { bucketType: 'file' });
      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        expect.stringMatching(/graph-generation\/task_user1_[^/]+\/files\/uf1_report\.pdf$/),
        expect.any(Buffer),
        'application/pdf'
      );
    });

    it('should copy multiple user library files (pdf, docx, pptx) into bundle files/ prefix', async () => {
      mockChatSvc.listConversations.mockResolvedValue({
        items: [{ id: 'c1', title: 'T1', messages: [] } as any],
        nextCursor: null,
      });
      mockUserFileSvc.listAllActiveFiles.mockResolvedValue([
        {
          _id: 'uf-pdf',
          displayName: 'report.pdf',
          s3Key: 'user-files/user1/uf-pdf.pdf',
          mimeType: 'application/pdf',
          updatedAt: new Date(),
        } as any,
        {
          _id: 'uf-docx',
          displayName: 'notes.docx',
          s3Key: 'user-files/user1/uf-docx.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          updatedAt: new Date(),
        } as any,
        {
          _id: 'uf-pptx',
          displayName: 'slides.pptx',
          s3Key: 'user-files/user1/uf-pptx.pptx',
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          updatedAt: new Date(),
        } as any,
      ]);
      mockStoragePort.downloadFile.mockImplementation(async (key: string) => ({
        buffer: Buffer.from(`bytes-for-${key}`),
        contentType: key.endsWith('.pdf')
          ? 'application/pdf'
          : key.endsWith('.docx')
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }));
      mockQueuePort.sendMessage.mockResolvedValue(undefined);
      mockGraphEmbSvc.saveStats.mockResolvedValue(undefined);

      await service.requestGraphGenerationViaQueue(userId);

      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        expect.stringMatching(/\/files\/uf-pdf_report\.pdf$/),
        expect.any(Buffer),
        'application/pdf'
      );
      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        expect.stringMatching(/\/files\/uf-docx_notes\.docx$/),
        expect.any(Buffer),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        expect.stringMatching(/\/files\/uf-pptx_slides\.pptx$/),
        expect.any(Buffer),
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
    });
  });

  describe('requestAddNodeViaQueue', () => {
    const userId = 'user1';

    it('returns null when no conversation, note, or user file changes', async () => {
      mockGraphEmbSvc.getStats.mockResolvedValue({
        userId,
        nodes: 1,
        edges: 0,
        clusters: 1,
        updatedAt: new Date().toISOString(),
        status: 'CREATED',
      });
      mockChatSvc.listConversations.mockResolvedValue({ items: [], nextCursor: null });
      mockNoteSvc.findNotesModifiedSince.mockResolvedValue([]);
      mockUserFileSvc.findFilesModifiedSince.mockResolvedValue([]);

      const result = await service.requestAddNodeViaQueue(userId);
      expect(result).toBeNull();
      expect(mockQueuePort.sendMessage).not.toHaveBeenCalled();
    });

    it('uses generatedAt as watermark when updatedAt is absent', async () => {
      const past = new Date('2020-01-01').toISOString();
      mockGraphEmbSvc.getStats.mockResolvedValue({
        userId,
        nodes: 6,
        edges: 0,
        clusters: 2,
        generatedAt: past,
        status: 'CREATED',
      });
      mockChatSvc.listConversations.mockResolvedValue({ items: [], nextCursor: null });
      mockNoteSvc.findNotesModifiedSince.mockResolvedValue([]);
      mockUserFileSvc.findFilesModifiedSince.mockResolvedValue([]);

      const result = await service.requestAddNodeViaQueue(userId);
      expect(result).toBeNull();
      expect(mockUserFileSvc.findFilesModifiedSince).toHaveBeenCalledWith(
        userId,
        new Date(past)
      );
    });

    it('uploads add-node prefix bundle with batch.json and files/ for modified user_files', async () => {
      const past = new Date('2020-01-01').toISOString();
      mockGraphEmbSvc.getStats.mockResolvedValue({
        userId,
        nodes: 1,
        edges: 0,
        clusters: 1,
        updatedAt: past,
        status: 'CREATED',
      });
      mockChatSvc.listConversations.mockResolvedValue({ items: [], nextCursor: null });
      mockNoteSvc.findNotesModifiedSince.mockResolvedValue([]);
      mockUserFileSvc.findFilesModifiedSince.mockResolvedValue([
        {
          _id: 'uf-add',
          displayName: 'report.pdf',
          s3Key: 'user-files/user1/uf-add.pdf',
          mimeType: 'application/pdf',
          updatedAt: new Date(),
          deletedAt: null,
        } as any,
      ]);
      mockStoragePort.downloadFile.mockResolvedValue({
        buffer: Buffer.from('%PDF'),
        contentType: 'application/pdf',
      });
      mockQueuePort.sendMessage.mockResolvedValue(undefined);
      mockGraphEmbSvc.saveStats.mockResolvedValue(undefined);

      const taskId = await service.requestAddNodeViaQueue(userId);

      expect(taskId).toContain('task_add_node_');
      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        expect.stringMatching(/add-node\/task_add_node_[^/]+\/batch\.json$/),
        expect.any(String),
        'application/json'
      );
      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        expect.stringMatching(/add-node\/task_add_node_[^/]+\/files\/uf-add_report\.pdf$/),
        expect.any(Buffer),
        'application/pdf'
      );
      expect(mockQueuePort.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          taskType: 'ADD_NODE_REQUEST',
          payload: expect.objectContaining({
            s3Key: expect.stringMatching(/add-node\/task_add_node_[^/]+\/$/),
          }),
        })
      );

      const batchUploadCall = mockStoragePort.upload.mock.calls.find((call) =>
        String(call[0]).endsWith('batch.json')
      );
      expect(batchUploadCall).toBeTruthy();
      const batchPayload = JSON.parse(batchUploadCall![1] as string);
      expect(batchPayload.existingClusters).toEqual([]);
    });

    it('serializes lean existingClusters in add-node batch.json', async () => {
      const past = new Date('2020-01-01').toISOString();
      mockGraphEmbSvc.getStats.mockResolvedValue({
        userId,
        nodes: 1,
        edges: 0,
        clusters: 1,
        updatedAt: past,
        status: 'CREATED',
      });
      mockGraphEmbSvc.listClusters.mockResolvedValue([
        {
          id: 'cluster-1',
          userId,
          name: 'AI',
          description: 'cluster desc',
          size: 2,
          themes: ['t1', 't2'],
          label: 'should-not-serialize',
        },
      ]);
      mockChatSvc.listConversations.mockResolvedValue({
        items: [
          {
            id: 'conv-new',
            title: 'New conv',
            updatedAt: new Date().toISOString(),
            messages: [
              {
                id: 'm1',
                role: 'user',
                content: 'hello',
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ],
        nextCursor: null,
      });
      mockNoteSvc.findNotesModifiedSince.mockResolvedValue([]);
      mockUserFileSvc.findFilesModifiedSince.mockResolvedValue([]);
      mockQueuePort.sendMessage.mockResolvedValue(undefined);
      mockGraphEmbSvc.saveStats.mockResolvedValue(undefined);

      await service.requestAddNodeViaQueue(userId);

      const batchUploadCall = mockStoragePort.upload.mock.calls.find((call) =>
        String(call[0]).endsWith('batch.json')
      );
      const batchPayload = JSON.parse(batchUploadCall![1] as string);
      expect(batchPayload.existingClusters).toEqual([
        {
          id: 'cluster-1',
          name: 'AI',
          description: 'cluster desc',
          size: 2,
          themes: ['t1', 't2'],
        },
      ]);
      expect(batchPayload.existingClusters[0]).not.toHaveProperty('userId');
      expect(batchPayload.existingClusters[0]).not.toHaveProperty('label');

      expect(mockQueuePort.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          payload: expect.objectContaining({
            s3Key: expect.stringMatching(/add-node\/task_add_node_[^/]+\/batch\.json$/),
          }),
        })
      );
    });
  });
});
