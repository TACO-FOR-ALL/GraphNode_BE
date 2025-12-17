import { UserService } from '../../src/core/services/UserService';
import { UserRepository } from '../../src/core/ports/UserRepository';
import { User, Provider } from '../../src/core/types/persistence/UserPersistence';
import { NotFoundError, ValidationError } from '../../src/shared/errors/domain';

class InMemoryUserRepo implements UserRepository {
  private users = new Map<number, User>();
  private nextId = 1;

  async findById(id: number): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByProvider(provider: Provider, providerUserId: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.provider === provider && user.providerUserId === providerUserId) {
        return user;
      }
    }
    return null;
  }

  async create(data: {
    provider: Provider;
    providerUserId: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    const id = this.nextId++;
    const user = new User({
      id: String(id),
      ...data,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    });
    this.users.set(id, user);
    return user;
  }

  async findOrCreateFromProvider(input: {
    provider: Provider;
    providerUserId: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    const existing = await this.findByProvider(input.provider, input.providerUserId);
    if (existing) {
      return existing;
    }
    return this.create(input);
  }

  async findApiKeyById(id: number, model: 'openai' | 'deepseek'): Promise<string | null> {
    const user = this.users.get(id);
    if (!user) return null;
    if (model === 'openai') return user.apiKeyOpenai || null;
    if (model === 'deepseek') return user.apiKeyDeepseek || null;
    return null;
  }

  async updateApiKeyById(id: number, model: 'openai' | 'deepseek', apiKey: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
        // User is immutable in this mock, so we need to replace it or hack it.
        // Since User class has getters, we can't set properties.
        // But for test, we can cast to any.
        if (model === 'openai') (user as any).props.apiKeyOpenai = apiKey;
        if (model === 'deepseek') (user as any).props.apiKeyDeepseek = apiKey;
    }
  }

  async deleteApiKeyById(id: number, model: 'openai' | 'deepseek'): Promise<void> {
    const user = this.users.get(id);
    if (user) {
        if (model === 'openai') (user as any).props.apiKeyOpenai = null;
        if (model === 'deepseek') (user as any).props.apiKeyDeepseek = null;
    }
  }

  // Helper
  async seed(data: Partial<Parameters<typeof this.create>[0]>) {
      return this.create({
          provider: 'google',
          providerUserId: `pid-${this.nextId}`,
          ...data
      });
  }
}

describe('UserService', () => {
  let userService: UserService;
  let userRepo: InMemoryUserRepo;

  beforeEach(() => {
    userRepo = new InMemoryUserRepo();
    userService = new UserService(userRepo);
  });

  describe('getUserProfile', () => {
    it('should return user profile for a valid ID', async () => {
      const user = await userRepo.seed({ displayName: 'Test User' });
      const userProfile = await userService.getUserProfile(user.id);

      expect(userProfile).toBeDefined();
      expect(userProfile.id).toBe(user.id);
      expect(userProfile.displayName).toBe('Test User');
    });

    it('should throw ValidationError for invalid ID format', async () => {
        await expect(userService.getUserProfile("abc")).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent ID', async () => {
      await expect(userService.getUserProfile("999")).rejects.toThrow(NotFoundError);
    });
  });

  describe('getApiKeys', () => {
      it('should return api key', async () => {
          const user = await userRepo.seed({});
          await userRepo.updateApiKeyById(Number(user.id), 'openai', 'sk-test');
          
          const result = await userService.getApiKeys(user.id, 'openai');
          expect(result.apiKey).toBe('sk-test');
      });
  });
});
