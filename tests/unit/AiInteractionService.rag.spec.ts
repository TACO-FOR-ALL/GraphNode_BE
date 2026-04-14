import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../src/shared/ai-providers/index', () => ({
  getAiProvider: jest.fn(),
}));

import { AiInteractionService } from '../../src/core/services/AiInteractionService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { UserService } from '../../src/core/services/UserService';
import { DailyUsageService } from '../../src/core/services/DailyUsageService';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { UpstreamError } from '../../src/shared/errors/domain';
import { IAiProvider } from '../../src/shared/ai-providers/IAiProvider';
import { getAiProvider } from '../../src/shared/ai-providers/index';
import { ChatRole } from '../../src/shared/dtos/ai';
import { ApiKeyModel } from '../../src/shared/dtos/me';

const mockChatSvc = {
  getConversation: jest.fn(),
  createConversation: jest.fn(),
  createMessage: jest.fn(),
  getMessages: jest.fn(),
} as unknown as jest.Mocked<ChatManagementService>;

const mockUserSvc = {
  getPreferredLanguage: jest.fn(),
} as unknown as jest.Mocked<UserService>;

const mockStorageAdapter = {
  upload: jest.fn(),
  downloadStream: jest.fn(),
} as unknown as jest.Mocked<StoragePort>;

const mockDailyUsageSvc = {
  checkLimit: jest.fn(),
  incrementUsage: jest.fn(),
} as unknown as jest.Mocked<DailyUsageService>;

const mockProvider: jest.Mocked<IAiProvider> = {
  checkAPIKeyValid: jest.fn(),
  generateChat: jest.fn(),
  requestGenerateThreadTitle: jest.fn(),
} as any;

describe('AiInteractionService (RAG)', () => {
  let service: AiInteractionService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getAiProvider as jest.Mock).mockReturnValue(mockProvider);
    mockDailyUsageSvc.checkLimit.mockResolvedValue(undefined);
    mockDailyUsageSvc.incrementUsage.mockResolvedValue(undefined);
    service = new AiInteractionService(
      mockChatSvc,
      mockUserSvc,
      mockStorageAdapter,
      mockDailyUsageSvc
    );
  });

  describe('handleRagAIChat', () => {
    const ownerUserId = 'user_rag';
    const conversationId = 'conv_rag';
    const ragChatBody = {
      id: 'msg_u_1',
      model: 'openai' as ApiKeyModel,
      chatContent: 'RAG question',
      retrievedContext: [
        { id: 'ctx_1', role: 'user' as ChatRole, content: 'context snippet 1' },
      ],
      recentMessages: [
        { id: 'prev_1', role: 'user' as ChatRole, content: 'previous user question' },
      ],
    };

    beforeEach(() => {
      mockUserSvc.getPreferredLanguage.mockResolvedValue('ko');
      mockChatSvc.getConversation.mockResolvedValue({ id: conversationId, title: 'RAG Chat' } as any);
      mockProvider.generateChat.mockResolvedValue({
        ok: true,
        data: { content: 'RAG answer', attachments: [] },
      });
      mockChatSvc.createMessage.mockImplementation((userId, convId, msg) =>
        Promise.resolve({ ...msg, id: 'db_id' } as any)
      );
    });

    it('should assemble RAG prompt correctly and save messages', async () => {
      const result = await service.handleRagAIChat(ownerUserId, ragChatBody, conversationId);

      expect(mockProvider.generateChat).toHaveBeenCalledWith(
        'sk-test-openai-key',
        expect.objectContaining({
          model: undefined,
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('context snippet 1'),
            }),
            expect.objectContaining({ role: 'user', content: 'previous user question' }),
            expect.objectContaining({ role: 'user', content: 'RAG question' }),
          ]),
        }),
        undefined,
        mockStorageAdapter
      );
      expect(mockChatSvc.createMessage).toHaveBeenCalledTimes(2);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].content).toBe('RAG answer');
      expect(mockDailyUsageSvc.checkLimit).toHaveBeenCalledWith(ownerUserId);
      expect(mockDailyUsageSvc.incrementUsage).toHaveBeenCalledWith(ownerUserId);
    });

    it('should generate title and create conversation if not exists in RAG mode', async () => {
      mockChatSvc.getConversation.mockRejectedValue({ code: 'NOT_FOUND' });
      mockProvider.requestGenerateThreadTitle.mockResolvedValue({
        ok: true,
        data: 'AI Generated RAG Title',
      });
      mockChatSvc.createConversation.mockResolvedValue({
        id: conversationId,
        title: 'AI Generated RAG Title',
      } as any);

      const result = await service.handleRagAIChat(ownerUserId, ragChatBody, conversationId);

      expect(mockProvider.requestGenerateThreadTitle).toHaveBeenCalled();
      expect(mockChatSvc.createConversation).toHaveBeenCalledWith(
        ownerUserId,
        conversationId,
        'AI Generated RAG Title'
      );
      expect(result.title).toBe('AI Generated RAG Title');
    });

    it('should throw UpstreamError if AI provider fails', async () => {
      mockProvider.generateChat.mockResolvedValue({ ok: false, error: 'AI Error' });

      await expect(service.handleRagAIChat(ownerUserId, ragChatBody, conversationId)).rejects.toThrow(
        UpstreamError
      );
    });
  });
});
