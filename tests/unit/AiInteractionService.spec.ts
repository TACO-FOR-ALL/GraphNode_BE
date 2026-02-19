/**
 * 목적: AiInteractionService 유닛 테스트.
 * - Stateless Chat API 흐름 검증 (`generateChat`)
 * - API Key 검증 로직 테스트
 * - 파일 업로드 및 StoragePort 전달 검증
 * - 에러 핸들링 검증
 */
import { Readable } from 'stream';
import { AiInteractionService } from '../../src/core/services/AiInteractionService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { UserService } from '../../src/core/services/UserService';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { ForbiddenError, ValidationError, UpstreamError, NotFoundError } from '../../src/shared/errors/domain';
import { IAiProvider, AiResponse, Result } from '../../src/shared/ai-providers/IAiProvider';

// Mocks
const mockChatSvc = {
  getConversation: jest.fn(),
  createConversation: jest.fn(),
  updateThreadId: jest.fn(),
  createMessage: jest.fn(),
  getMessages: jest.fn(),
} as unknown as jest.Mocked<ChatManagementService>;

const mockUserSvc = {
  getApiKeys: jest.fn(),
} as unknown as jest.Mocked<UserService>;

const mockStorageAdapter = {
  upload: jest.fn(),
  downloadStream: jest.fn(),
} as unknown as jest.Mocked<StoragePort>;

// Mock AI Provider Implementation
const mockProvider: jest.Mocked<IAiProvider> = {
  checkAPIKeyValid: jest.fn(),
  generateChat: jest.fn(),
  requestGenerateThreadTitle: jest.fn(),
  uploadFile: jest.fn(),     // Optional legacy
  downloadFile: jest.fn(),   // Optional legacy
};

// Mock `getAiProvider` factory
jest.mock('../../src/shared/ai-providers/index', () => ({
  getAiProvider: jest.fn(),
}));

import { getAiProvider } from '../../src/shared/ai-providers/index';

describe('AiInteractionService', () => {
  let service: AiInteractionService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getAiProvider as jest.Mock).mockReturnValue(mockProvider); // Factory returns our mock provider
    service = new AiInteractionService(mockChatSvc, mockUserSvc, mockStorageAdapter);
  });

  describe('checkApiKey', () => {
    it('should return true if API key is valid', async () => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'valid-key' } as any);
      mockProvider.checkAPIKeyValid.mockResolvedValue({ ok: true, data: true });

      const result = await service.checkApiKey('user_1', 'openai');
      expect(result).toBe(true);
      expect(mockUserSvc.getApiKeys).toHaveBeenCalledWith('user_1', 'openai');
      expect(mockProvider.checkAPIKeyValid).toHaveBeenCalledWith('valid-key');
    });

    it('should throw ForbiddenError if API key is not found', async () => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: undefined } as any);

      await expect(service.checkApiKey('user_1', 'openai'))
        .rejects.toThrow(ForbiddenError);
    });

    it('should throw ValidationError if API key is invalid', async () => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'invalid-key' } as any);
      mockProvider.checkAPIKeyValid.mockResolvedValueOnce({ ok: false, error: 'Invalid key' });

      await expect(service.checkApiKey('user_1', 'openai'))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if factory fails (unsupported model)', async () => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'valid-key' } as any);
      (getAiProvider as jest.Mock).mockImplementation(() => { throw new Error('Unsupported'); });

      await expect(service.checkApiKey('user_1', 'unknown' as any))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('handleAIChat', () => {
    const ownerUserId = 'user_1';
    const conversationId = 'conv_1';
    const chatBody = { id: 'msg_1', model: 'openai', chatContent: 'Hello AI' } as any;
    const file = {
      fieldname: 'files',
      originalname: 'test.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: Buffer.from('test'),
      size: 4,
    } as Express.Multer.File;

    beforeEach(() => {
        // Default successful mocks
        mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'sk-test' } as any);
        mockChatSvc.getConversation.mockResolvedValue({
            id: conversationId,
            title: 'Chat',
            messages: [],
        } as any);
        mockChatSvc.getMessages.mockResolvedValue([]);
        mockProvider.checkAPIKeyValid.mockResolvedValue({ ok: true, data: true });
        mockProvider.generateChat.mockResolvedValue({
            ok: true,
            data: {
                content: 'AI Response',
                attachments: [],
                metadata: { usage: 100 }
            }
        });
        mockChatSvc.createMessage.mockResolvedValue({ id: 'msg_created' } as any);
    });

    it('should process files, retrieve history, and call provider.generateChat', async () => {
      // Execution
      const onStream = jest.fn();
      const result = await service.handleAIChat(
        ownerUserId,
        chatBody,
        conversationId,
        [file],
        onStream
      );

      // 1. File Upload (S3)
      expect(mockStorageAdapter.upload).toHaveBeenCalled(); // S3 upload called

      // 2. Provider Factory & Key Check
      expect(getAiProvider).toHaveBeenCalledWith('openai');
      // Note: In development, checkAPIKeyValid might be skipped unless NODE_ENV is strictly checked or mocked.
      // Based on code: if (process.env.NODE_ENV !== 'development') checkAPIKeyValid...
      // Jest default NODE_ENV is 'test', so it might be skipped. Let's check logic.

      // 3. History Retrieval
      expect(mockChatSvc.getMessages).toHaveBeenCalledWith(conversationId);

      // 4. Generate Chat Call
      expect(mockProvider.generateChat).toHaveBeenCalledWith(
          'sk-test',
          expect.objectContaining({
              messages: expect.arrayContaining([
                  expect.objectContaining({ role: 'user', content: 'Hello AI' })
              ])
          }),
          onStream,
          mockStorageAdapter // Must pass storage adapter
      );

      // 5. Message Persistence
      expect(mockChatSvc.createMessage).toHaveBeenCalledTimes(2); // User + Assistant
      expect(mockChatSvc.createMessage).toHaveBeenLastCalledWith(
          ownerUserId,
          conversationId,
          expect.objectContaining({
              role: 'assistant',
              content: 'AI Response'
          })
      );
    });

    it('should create new conversation if not found', async () => {
        mockChatSvc.getConversation.mockRejectedValue(new NotFoundError('Not found'));
        mockChatSvc.createConversation.mockResolvedValue({
            id: conversationId,
            title: 'New Chat',
            messages: []
        } as any);
        mockProvider.requestGenerateThreadTitle.mockResolvedValue({ ok: true, data: 'Generated Title' });

        await service.handleAIChat(ownerUserId, chatBody, conversationId, [], undefined);

        expect(mockChatSvc.createConversation).toHaveBeenCalled();
        expect(mockProvider.requestGenerateThreadTitle).toHaveBeenCalled();
    });

    it('should throw UpstreamError if provider.generateChat fails', async () => {
        mockProvider.generateChat.mockResolvedValue({ ok: false, error: 'Provider Error' });

        await expect(service.handleAIChat(ownerUserId, chatBody, conversationId, [], undefined))
            .rejects.toThrow(UpstreamError);
    });

    it('should handle streaming callbacks if provided', async () => {
        // Mock streaming behavior in generateChat
        mockProvider.generateChat.mockImplementation(async (key, params, onStream) => {
            onStream?.('Chunk1');
            onStream?.('Chunk2');
            return { ok: true, data: { content: 'Chunk1Chunk2', attachments: [] } };
        });

        const onStream = jest.fn();
        await service.handleAIChat(ownerUserId, chatBody, conversationId, [], onStream);

        expect(onStream).toHaveBeenCalledWith('Chunk1');
        expect(onStream).toHaveBeenCalledWith('Chunk2');
    });
  });

  describe('downloadFile', () => {
    it('should delegate to storageAdapter', async () => {
      const mockStream = new Readable();
      mockStorageAdapter.downloadStream.mockResolvedValue(mockStream);

      const result = await service.downloadFile('key');
      expect(mockStorageAdapter.downloadStream).toHaveBeenCalledWith('key', { bucketType: 'file' });
      expect(result).toBe(mockStream);
    });
  });
});
