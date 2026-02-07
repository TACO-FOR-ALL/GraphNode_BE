import { UserService } from '../../src/core/services/UserService';
import { UserRepository } from '../../src/core/ports/UserRepository';
import { User } from '../../src/core/types/persistence/UserPersistence';
import { NotFoundError, ValidationError, InvalidApiKeyError } from '../../src/shared/errors/domain';
import { ApiKeyModel } from '../../src/shared/dtos/me';

// Mock getAiProvider
jest.mock('../../src/shared/ai-providers/index', () => ({
  getAiProvider: jest.fn(),
}));
import { getAiProvider } from '../../src/shared/ai-providers/index';

describe('UserService', () => {
  let service: UserService;
  let mockRepo: jest.Mocked<UserRepository>;

  // Create a proper User instance
  const mockUser = new User({
    id: '1',
    provider: 'google',
    providerUserId: 'google-1',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: 'http://example.com/avatar.jpg',
    createdAt: new Date(),
    lastLoginAt: new Date(),
    apiKeyOpenai: 'sk-old',
    apiKeyDeepseek: null,
    apiKeyClaude: null,
    apiKeyGemini: null,
  });

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      findOrCreateFromProvider: jest.fn(),
      findByProvider: jest.fn(),
      updateApiKeyById: jest.fn(),
      getApiKeys: jest.fn(),
      updateOpenAiAssistantId: jest.fn(),
      getOpenAiAssistantId: jest.fn(),
      deleteApiKeyById: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    service = new UserService(mockRepo);
    jest.clearAllMocks();
  });

  describe('getUserProfile', () => {
    it('should return user profile if found', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      const profile = await service.getUserProfile('1');
      expect(profile).toEqual({
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
        avatarUrl: 'http://example.com/avatar.jpg',
      });
    });

    it('should throw NotFoundError if user not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.getUserProfile('1')).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for invalid userId', async () => {
      await expect(service.getUserProfile('abc')).rejects.toThrow(ValidationError);
    });
  });

  describe('getApiKeys', () => {
      it('should return specific api key', async () => {
          mockRepo.findById.mockResolvedValue(mockUser);
          const res = await service.getApiKeys('1', 'openai');
          expect(res.apiKey).toBe('sk-old');
      });

      it('should return null if key not present', async () => {
        mockRepo.findById.mockResolvedValue(mockUser);
        const res = await service.getApiKeys('1', 'deepseek');
        expect(res.apiKey).toBeNull();
      });

      it('should throw ValidationError for invalid model', async () => {
        mockRepo.findById.mockResolvedValue(mockUser);
        await expect(service.getApiKeys('1', 'invalid' as any)).rejects.toThrow(ValidationError);
      });
  });

  describe('updateApiKey', () => {
    it('should update API key if valid', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      // Ensure we are in non-development to test validation logic, OR mock logic
      // The service checks process.env.NODE_ENV !== 'development'. 
      // Jest sets NODE_ENV to 'test'. So validation WILL run.
      
      const mockProvider = { checkAPIKeyValid: jest.fn().mockResolvedValue({ ok: true }) };
      (getAiProvider as jest.Mock).mockReturnValue(mockProvider);

      await service.updateApiKey('1', 'openai', 'sk-new');
      
      expect(getAiProvider).toHaveBeenCalledWith('openai');
      expect(mockProvider.checkAPIKeyValid).toHaveBeenCalledWith('sk-new');
      expect(mockRepo.updateApiKeyById).toHaveBeenCalledWith(1, 'openai', 'sk-new');
    });

    it('should throw InvalidApiKeyError if validation fails', async () => {
        const mockProvider = { checkAPIKeyValid: jest.fn().mockResolvedValue({ ok: false, error: 'Invalid' }) };
        (getAiProvider as jest.Mock).mockReturnValue(mockProvider);

        await expect(service.updateApiKey('1', 'openai', 'sk-bad')).rejects.toThrow(InvalidApiKeyError);
    });

    it('should throw ValidationError for invalid model', async () => {
        await expect(service.updateApiKey('1', 'invalid' as any, 'key')).rejects.toThrow(ValidationError);
    });
    
    it('should throw ValidationError for empty key', async () => {
        await expect(service.updateApiKey('1', 'openai', '')).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteApiKey', () => {
      it('should delete api key', async () => {
          mockRepo.findById.mockResolvedValue(mockUser);
          await service.deleteApiKey('1', 'openai');
          expect(mockRepo.deleteApiKeyById).toHaveBeenCalledWith(1, 'openai');
      });
  });

  describe('Assistant ID', () => {
      it('getOpenAiAssistantId', async () => {
          mockRepo.getOpenAiAssistantId.mockResolvedValue('asst_123');
          const res = await service.getOpenAiAssistantId('1');
          expect(res).toBe('asst_123');
      });

      it('updateOpenAiAssistantId', async () => {
          await service.updateOpenAiAssistantId('1', 'asst_new');
          expect(mockRepo.updateOpenAiAssistantId).toHaveBeenCalledWith(1, 'asst_new');
      });
  });
});
