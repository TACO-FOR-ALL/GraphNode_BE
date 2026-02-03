/**
 * 목적: GraphGenerationService 유닛 테스트.
 * 접근: 외부 의존성(ChatManagementService, GraphEmbeddingService, HttpClient)을 모킹하여 로직 검증.
 */
import { GraphGenerationService } from '../../src/core/services/GraphGenerationService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import { HttpClient } from '../../src/infra/http/httpClient';
import { ConflictError } from '../../src/shared/errors/domain';
import { QueuePort } from '../../src/core/ports/QueuePort';
import { StoragePort } from '../../src/core/ports/StoragePort';

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
      getSignedUrl: jest.fn(),
    } as any;

    // HttpClient mock instance
    mockHttpClient = {
      post: jest.fn().mockImplementation(async (url, data) => {
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

    service = new GraphGenerationService(mockChatSvc, mockGraphEmbSvc, mockQueuePort, mockStoragePort);

    // Use fake timers to control polling
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('generateGraphForUser', () => {
    const userId = 'user1';

    it('should fetch conversations, transform data, and send to AI server', async () => {
      // Arrange
      mockChatSvc.listConversations.mockResolvedValueOnce({
        items: [{ id: 'c1', title: 'T1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] } as any],
        nextCursor: null,
      });
      // getMessages might not be called if messages are already in conv.messages (depending on implementation)
      // Current implementation in streamUserData uses conv.messages:
      // const messages: ChatMessage[] = conv.messages;
      
      mockHttpClient.get.mockResolvedValueOnce({ task_id: 'task1', status: 'completed' });
      mockHttpClient.get.mockResolvedValueOnce({
        nodes: [],
        edges: [],
        metadata: { clusters: {}, generated_at: new Date().toISOString(), total_nodes: 0, total_edges: 0, total_clusters: 0 }
      }); // Result

      // Act
      const taskId = await service.generateGraphForUser(userId);

      // Assert
      expect(taskId).toBe('task1');
      expect(mockChatSvc.listConversations).toHaveBeenCalled();
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/analysis',
        expect.any(Object)
      );

      // Fast-forward time to trigger polling
      jest.runOnlyPendingTimers();

      // Verify polling happened
      expect(mockHttpClient.get).toHaveBeenCalledWith('/status/task1');
    });

    it('should throw ConflictError if task is already in progress', async () => {
      // Arrange
      mockChatSvc.listConversations.mockResolvedValue({ items: [], nextCursor: null });
      mockHttpClient.post.mockResolvedValue({ task_id: 'task1', status: 'processing' });

      // Act
      await service.generateGraphForUser(userId); // First call

      // Assert
      await expect(service.generateGraphForUser(userId)) // Second call
        .rejects.toThrow(ConflictError);
    });
  });

  describe('requestGraphSummary', () => {
    const userId = 'user1';

    it('should request summary successfully', async () => {
      // Arrange
      const snapshot = { nodes: [{ id: 1 }] };
      mockGraphEmbSvc.getSnapshotForUser = jest.fn().mockResolvedValue(snapshot);
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
      mockGraphEmbSvc.getSnapshotForUser = jest.fn().mockResolvedValue(null);

      await expect(service.requestGraphSummary(userId)).rejects.toThrow();
    });
  });
});
