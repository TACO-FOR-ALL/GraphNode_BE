/**
 * 목적: AiInteractionService 유닛 테스트.
 * - OpenAI Assistants API 흐름 검증
 * - Standard Chat API 흐름 검증
 * - API Key 검증 로직 테스트
 * - 파일 업로드/다운로드 로직 검증
 * - 에러 핸들링 검증
 */
import { Readable } from 'stream';

import { AiInteractionService } from '../../src/core/services/AiInteractionService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { UserService } from '../../src/core/services/UserService';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { ForbiddenError, ValidationError, UpstreamError, NotFoundError } from '../../src/shared/errors/domain';

// Mocks
const mockChatSvc = {
  getConversation: jest.fn(),
  createConversation: jest.fn(),
  updateThreadId: jest.fn(),
  createMessage: jest.fn(),
} as unknown as jest.Mocked<ChatManagementService>;

const mockUserSvc = {
  getApiKeys: jest.fn(),
  getOpenAiAssistantId: jest.fn(),
  updateOpenAiAssistantId: jest.fn(),
} as unknown as jest.Mocked<UserService>;

const mockStorageAdapter = {
  upload: jest.fn(),
  downloadStream: jest.fn(),
} as unknown as jest.Mocked<StoragePort>;

// Mock OpenAI Provider
const mockProvider = {
  checkAPIKeyValid: jest.fn().mockResolvedValue({ ok: true }),
  requestGenerateThreadTitle: jest.fn().mockResolvedValue({ ok: true, data: 'New Title' }),
  createThread: jest.fn().mockResolvedValue({ ok: true, data: { threadId: 'thread_123' } }),
  uploadFile: jest.fn().mockResolvedValue({ ok: true, data: { fileId: 'file_openai_123' } }),
  addMessage: jest.fn().mockResolvedValue({ ok: true, data: {} }),
  createAssistant: jest.fn().mockResolvedValue({ ok: true, data: { assistantId: 'asst_123' } }),
  runAssistantStream: jest.fn().mockResolvedValue({
    ok: true,
    data: (async function* () {
      yield { event: 'thread.message.delta', data: { delta: { content: [{ text: { value: 'Hello' } }] } } };
      yield { event: 'thread.message.delta', data: { delta: { content: [{ text: { value: ' World' } }] } } };
    })(),
  }),
  requestStream: jest.fn(), // Will be mocked per test for standard chat
  requestWithoutStream: jest.fn(),
};

// Mock the module function only
jest.mock('../../src/shared/ai-providers/index', () => ({
  getAiProvider: jest.fn(),
}));

// Import the mocked function to set implementation
import { getAiProvider } from '../../src/shared/ai-providers/index';


describe('AiInteractionService', () => {
  let service: AiInteractionService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getAiProvider as jest.Mock).mockReturnValue(mockProvider);
    service = new AiInteractionService(mockChatSvc, mockUserSvc, mockStorageAdapter);
  });

  describe('checkApiKey', () => {
    it('should return true if API key is valid', async () => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'valid-key' } as any);
      mockProvider.checkAPIKeyValid.mockResolvedValue({ ok: true });

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

    it('should throw ValidationError if model is unsupported', async () => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'valid-key' } as any);
      (getAiProvider as jest.Mock).mockImplementation(() => { throw new Error('Unsupported'); });

      await expect(service.checkApiKey('user_1', 'unknown' as any))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('handleAIChat (OpenAI Assistants)', () => {
    const ownerUserId = 'user_1';
    const conversationId = 'conv_1';
    const chatBody = { id: 'msg_1', model: 'openai', chatContent: 'Hi with file' } as any;
    const file = {
      fieldname: 'files',
      originalname: 'test.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: Buffer.from('test'),
      size: 4,
    } as Express.Multer.File;

    it('should upload files, create thread, and stream response', async () => {
      // 1. Mock Setup
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'sk-test' } as any);
      mockChatSvc.getConversation.mockResolvedValue({
        id: conversationId,
        title: 'Chat',
        messages: [],
      } as any);

      // 2. Execution
      const onStream = jest.fn();
      const result = await service.handleAIChat(
        ownerUserId,
        chatBody,
        conversationId,
        [file],
        onStream
      );

      // 3. Verifications
      
      // S3 Upload
      expect(mockStorageAdapter.upload).toHaveBeenCalled();
      
      // OpenAI Thread Creation
      expect(mockProvider.createThread).toHaveBeenCalledWith('sk-test');
      expect(mockChatSvc.updateThreadId).toHaveBeenCalledWith(conversationId, ownerUserId, 'thread_123');

      // OpenAI File Upload
      expect(mockProvider.uploadFile).toHaveBeenCalled();

      // Message Added
      expect(mockProvider.addMessage).toHaveBeenCalledWith(
        'sk-test',
        'thread_123',
        'user',
        [
          { type: 'text', text: 'Hi with file' },
          { type: 'image_file', image_file: { file_id: 'file_openai_123' } },
        ],
        []
      );

      // Run Stream
      expect(mockProvider.runAssistantStream).toHaveBeenCalled();
      
      // Streaming Callbacks
      expect(onStream).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onStream).toHaveBeenNthCalledWith(2, ' World');

      // Persistence (User & AI Msgs)
      expect(mockChatSvc.createMessage).toHaveBeenCalledTimes(2); // User + Assistant
      expect(result.messages).toHaveLength(2);
    });

    it('should reuse existing externalThreadId', async () => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'sk-test' } as any);
      mockChatSvc.getConversation.mockResolvedValue({
        id: conversationId,
        title: 'Chat',
        messages: [],
        externalThreadId: 'existing_thread',
      } as any);

      await service.handleAIChat(ownerUserId, chatBody, conversationId, [], jest.fn());

      expect(mockProvider.createThread).not.toHaveBeenCalled();
      expect(mockProvider.addMessage).toHaveBeenCalledWith(
        expect.anything(),
        'existing_thread',
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('handleAIChat (Standard Chat - e.g., Claude)', () => {
    const ownerUserId = 'user_1';
    const conversationId = 'conv_1';
    const chatBody = { id: 'msg_2', model: 'claude', chatContent: 'Hello Claude' } as any;

    it('should handle standard chat with streaming', async () => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'sk-claude' } as any);
      mockChatSvc.getConversation.mockResolvedValue({
        id: conversationId,
        title: 'Claude Chat',
        messages: [{ role: 'user', content: 'Prev msg' }],
      } as any);

      // Mock stream response for standard chat
      mockProvider.requestStream.mockResolvedValue({
        ok: true,
        data: (async function* () {
          yield { choices: [{ delta: { content: 'Claude' } }] };
          yield { choices: [{ delta: { content: ' response' } }] };
        })(),
      });

      const onStream = jest.fn();
      const result = await service.handleAIChat(
        ownerUserId,
        chatBody,
        conversationId,
        [],
        onStream
      );

      // Verifications
      expect(mockProvider.requestStream).toHaveBeenCalledWith(
        'sk-claude',
        'claude-3-haiku-20240307', // Expecting specific model mapping as per service implementation
        expect.arrayContaining([
            { role: 'user', content: 'Prev msg' },
            { role: 'user', content: 'Hello Claude' }
        ])
      );
      
      expect(onStream).toHaveBeenCalledWith('Claude');
      expect(onStream).toHaveBeenCalledWith(' response');
      
      expect(mockChatSvc.createMessage).toHaveBeenCalledTimes(2);
      expect(result.messages).toHaveLength(2);
    });

    it('should handle standard chat without streaming', async () => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'sk-claude' } as any);
      mockChatSvc.getConversation.mockResolvedValue({
        id: conversationId,
        title: 'Claude Chat',
        messages: [],
      } as any);

      mockProvider.requestWithoutStream.mockResolvedValue({
        ok: true,
        data: { choices: [{ message: { content: 'Full response' } }] }
      });

      mockChatSvc.createMessage.mockResolvedValue({
          id: 'msg_2',
          role: 'assistant',
          content: 'Full response',
      } as any);

      const result = await service.handleAIChat(
        ownerUserId,
        chatBody,
        conversationId,
        [],
        undefined // No stream callback
      );



      expect(mockProvider.requestWithoutStream).toHaveBeenCalled();
      expect(mockChatSvc.createMessage).toHaveBeenCalledTimes(2);
      expect(result.messages?.[1].content).toBe('Full response');
    });
  });

  describe('handleAIChat (Errors & Edge Cases)', () => {
    it('should create new conversation if not found', async () => {
       mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'sk-test' } as any);
       mockChatSvc.getConversation.mockRejectedValue(new NotFoundError('Not found'));
       mockChatSvc.createConversation.mockResolvedValue({
         id: 'new_conv',
         title: 'New Title',
         messages: []
       } as any);

       const chatBody = { id: 'msg_1', model: 'openai', chatContent: 'Init' } as any;
       
       await service.handleAIChat('user_1', chatBody, 'new_conv', [], jest.fn());

       expect(mockProvider.requestGenerateThreadTitle).toHaveBeenCalled();
       expect(mockChatSvc.createConversation).toHaveBeenCalled();
    });

    it('should throw ForbiddenError if API key not found in handleAIChat', async () => {
      mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: undefined } as any);
      const chatBody = { id: 'msg_1', model: 'openai', chatContent: 'Init' } as any;

      await expect(service.handleAIChat('user_1', chatBody, 'conv_1', [], jest.fn()))
        .rejects.toThrow(ForbiddenError);
    });

    it('should throw UpstreamError if AI provider fails', async () => {
        mockUserSvc.getApiKeys.mockResolvedValue({ apiKey: 'sk-test' } as any);
        mockChatSvc.getConversation.mockResolvedValue({ messages: [] } as any);
        
        const chatBody = { id: 'msg_1', model: 'openai', chatContent: 'Fail me' } as any;
        
        // Mock fail
        mockProvider.createThread.mockResolvedValueOnce({ ok: false, error: 'OpenAI down' });
        
        await expect(service.handleAIChat('user_1', chatBody, 'conv_1', [], undefined))
          .rejects.toThrow(UpstreamError);
    });
  });

  describe('downloadFile', () => {
    it('should call storageAdapter.downloadStream with correct key', async () => {
      const mockStream = new Readable();
      mockStorageAdapter.downloadStream.mockResolvedValue(mockStream);

      const result = await service.downloadFile('chat-files/abcd.png');

      expect(mockStorageAdapter.downloadStream).toHaveBeenCalledWith('chat-files/abcd.png', {
        bucketType: 'file',
      });
      expect(result).toBe(mockStream);
    });
  });
});
