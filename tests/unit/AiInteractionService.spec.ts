/**
 * 목적: AiInteractionService 유닛 테스트.
 * - OpenAI Assistants API 흐름 검증
 * - 파일 업로드/다운로드 로직 검증
 */
import { AiInteractionService } from '../../src/core/services/AiInteractionService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { UserService } from '../../src/core/services/UserService';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { Readable } from 'stream';
import { AppError } from '../../src/shared/errors/base';

// Mocks
const mockChatSvc = {
  getConversation: jest.fn(),
  createConversation: jest.fn(),
  updateThreadId: jest.fn(),
  createMessage: jest.fn(),
} as unknown as jest.Mocked<ChatManagementService>;

const mockUserSvc = {
  getApiKeys: jest.fn(),
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
  runAssistantStream: jest.fn().mockResolvedValue({
    ok: true,
    data: (async function* () {
      yield { event: 'thread.message.delta', data: { delta: { content: [{ text: { value: 'Hello' } }] } } };
      yield { event: 'thread.message.delta', data: { delta: { content: [{ text: { value: ' World' } }] } } };
    })(),
  }),
  requestStream: jest.fn(),
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
        'Hi with file',
        ['file_openai_123']
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
