import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../src/shared/ai-providers/index', () => ({
  getAiProvider: jest.fn(),
}));

import { AiInteractionService } from '../../src/core/services/AiInteractionService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { UserService } from '../../src/core/services/UserService';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { UpstreamError, NotFoundError } from '../../src/shared/errors/domain';
import { IAiProvider } from '../../src/shared/ai-providers/IAiProvider';
import { getAiProvider } from '../../src/shared/ai-providers/index';
import { ChatMessage, ChatRole } from '../../src/shared/dtos/ai';
import { ApiKeyModel } from '../../src/shared/dtos/me';

// Mocks
const mockChatSvc = {
  getConversation: jest.fn(),
  createConversation: jest.fn(),
  createMessage: jest.fn(),
  getMessages: jest.fn(),
} as unknown as jest.Mocked<ChatManagementService>;

const mockUserSvc = {
  getApiKeys: jest.fn(),
  getPreferredLanguage: jest.fn(),
} as unknown as jest.Mocked<UserService>;

const mockStorageAdapter = {
  upload: jest.fn(),
  downloadStream: jest.fn(),
} as unknown as jest.Mocked<StoragePort>;

const mockProvider: jest.Mocked<IAiProvider> = {
  checkAPIKeyValid: jest.fn(),
  generateChat: jest.fn(),
  requestGenerateThreadTitle: jest.fn(),
} as any;

jest.mock('../../src/shared/ai-providers/index', () => ({
  getAiProvider: jest.fn(),
}));

describe('AiInteractionService (RAG)', () => {
  let service: AiInteractionService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getAiProvider as jest.Mock).mockReturnValue(mockProvider);
    service = new AiInteractionService(mockChatSvc, mockUserSvc, mockStorageAdapter);
  });

  describe('handleRagAIChat', () => {
    const ownerUserId = 'user_rag';
    const conversationId = 'conv_rag';
    const ragChatBody = {
      id: 'msg_u_1',
      model: 'openai' as ApiKeyModel,
      chatContent: '이 문서를 바탕으로 답해줘.',
      retrievedContext: [
        { id: 'ctx_1', role: 'user' as ChatRole, content: '맥락 데이터 1' },
      ],
      recentMessages: [
        { id: 'prev_1', role: 'user' as ChatRole, content: '이전 대화' }
      ]
    };

    beforeEach(() => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'sk-rag-test' } as any);
      mockUserSvc.getPreferredLanguage.mockResolvedValue('ko');
      mockChatSvc.getConversation.mockResolvedValue({ id: conversationId, title: 'RAG Chat' } as any);
      mockProvider.checkAPIKeyValid.mockResolvedValue({ ok: true, data: true }); // API Key 검증 기본 성공
      mockProvider.generateChat.mockResolvedValue({
        ok: true,
        data: { content: 'RAG 기반 AI 응답', attachments: [] }
      });
      mockChatSvc.createMessage.mockImplementation((userId, convId, msg) => Promise.resolve({ ...msg, id: 'db_id' } as any));
    });

    it('should assemble RAG prompt correctly and save messages', async () => {
      const result = await service.handleRagAIChat(ownerUserId, ragChatBody, conversationId);

      // 1. 프롬프트 조립 확인 (System 프롬프트에 retrievedContext가 포함되어야 함)
      expect(mockProvider.generateChat).toHaveBeenCalledWith(
        'sk-rag-test',
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('맥락 데이터 1')
            }),
            expect.objectContaining({ role: 'user', content: '이전 대화' }),
            expect.objectContaining({ role: 'user', content: '이 문서를 바탕으로 답해줘.' })
          ])
        }),
        undefined,
        mockStorageAdapter
      );

      // 2. 메시지 저장 확인
      expect(mockChatSvc.createMessage).toHaveBeenCalledTimes(2);
      expect(result.messages.length).toBe(2);
      expect(result.messages[1].content).toBe('RAG 기반 AI 응답');
    });

    it('should generate title and create conversation if not exists in RAG mode', async () => {
      mockChatSvc.getConversation.mockRejectedValue({ code: 'NOT_FOUND' });
      mockProvider.requestGenerateThreadTitle.mockResolvedValue({ ok: true, data: 'AI Generated RAG Title' });
      mockChatSvc.createConversation.mockResolvedValue({ id: conversationId, title: 'AI Generated RAG Title' } as any);

      const result = await service.handleRagAIChat(ownerUserId, ragChatBody, conversationId);

      expect(mockProvider.requestGenerateThreadTitle).toHaveBeenCalled();
      expect(mockChatSvc.createConversation).toHaveBeenCalledWith(ownerUserId, conversationId, 'AI Generated RAG Title');
      expect(result.title).toBe('AI Generated RAG Title');
    });

    it('should throw UpstreamError if AI provider fails', async () => {
      mockProvider.generateChat.mockResolvedValue({ ok: false, error: 'AI Error' });

      await expect(service.handleRagAIChat(ownerUserId, ragChatBody, conversationId))
        .rejects.toThrow(UpstreamError);
    });
  });
});
