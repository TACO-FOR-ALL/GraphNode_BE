/**
 * 목적: GraphGenerationService 유닛 테스트.
 * 접근: 외부 의존성(ChatManagementService, GraphEmbeddingService, HttpClient)을 모킹하여 로직 검증.
 */
import { GraphGenerationService } from '../../src/core/services/GraphGenerationService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import { HttpClient } from '../../src/infra/http/httpClient';
import { ConflictError } from '../../src/shared/errors/domain';

// Mock HttpClient
jest.mock('../../src/infra/http/httpClient');

describe('GraphGenerationService', () => {
  let service: GraphGenerationService;
  let mockChatSvc: jest.Mocked<ChatManagementService>;
  let mockGraphEmbSvc: jest.Mocked<GraphEmbeddingService>;
  let mockHttpClient: jest.Mocked<HttpClient>;

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

    // HttpClient mock instance
    mockHttpClient = {
      post: jest.fn(),
      get: jest.fn(),
    } as any;
    (HttpClient as jest.Mock).mockImplementation(() => mockHttpClient);

    service = new GraphGenerationService(mockChatSvc, mockGraphEmbSvc);
    
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
        items: [{ id: 'c1', title: 'T1', createdAt: Date.now(), updatedAt: Date.now() } as any],
        nextCursor: null
      });
      mockChatSvc.getMessages.mockResolvedValueOnce([
        { id: 'm1', role: 'user', content: 'hi', createdAt: Date.now() } as any
      ]);
      mockHttpClient.post.mockResolvedValueOnce({ task_id: 'task1', status: 'processing' });
      
      // Mock get for polling to stop it immediately
      mockHttpClient.get.mockResolvedValueOnce({ task_id: 'task1', status: 'completed' });
      mockHttpClient.get.mockResolvedValueOnce({}); // Result

      // Act
      const taskId = await service.generateGraphForUser(userId);

      // Assert
      expect(taskId).toBe('task1');
      expect(mockChatSvc.listConversations).toHaveBeenCalledWith(userId, 50, undefined);
      expect(mockChatSvc.getMessages).toHaveBeenCalledWith('c1');
      expect(mockHttpClient.post).toHaveBeenCalledWith('/analysis', expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            title: 'T1',
            mapping: expect.objectContaining({
              'm1': expect.objectContaining({
                message: expect.objectContaining({
                  content: expect.objectContaining({ parts: ['hi'] })
                })
              })
            })
          })
        ])
      }));
      
      // Fast-forward time to trigger polling
      jest.runOnlyPendingTimers();
      
      // Verify polling happened (optional but good)
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
});
