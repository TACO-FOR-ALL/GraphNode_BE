/**
 * 목적: GraphGenerationService 유닛 테스트.
 * 접근: 외부 의존성(ChatManagementService, GraphEmbeddingService, HttpClient)을 모킹하여 로직 검증.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { GraphGenerationService } from '../../src/core/services/GraphGenerationService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import { HttpClient } from '../../src/infra/http/httpClient';
import { ConflictError } from '../../src/shared/errors/domain';
import { QueuePort } from '../../src/core/ports/QueuePort';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { UserService } from '../../src/core/services/UserService';
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
    } as any;

    mockUserSvc = {
      findById: jest.fn(),
      getPreferredLanguage: jest.fn<any>().mockResolvedValue('ko'),
    } as any;

    mockNotificationSvc = {
      sendTaskCompleted: jest.fn(),
      sendTaskFailed: jest.fn(),
      sendNotification: jest.fn(),
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

    it('should upload data to S3 and send SQS message', async () => {
      // Arrange
      mockChatSvc.listConversations.mockResolvedValue({
        items: [{ id: 'c1', title: 'T1', messages: [] } as any],
        nextCursor: null,
      });
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
            bucket: process.env.S3_PAYLOAD_BUCKET
          })
        })
      );
      expect(mockGraphEmbSvc.saveStats).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CREATING' })
      );
    });
  });
});
