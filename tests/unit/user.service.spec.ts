/**
 * 목적: UserService 유닛 테스트.
 * 접근: UserRepository 포트 인터페이스를 인메모리 스텁으로 구현하여 서비스 로직만 검증합니다.
 */
import { UserService } from '../../src/core/services/UserService';
import { UserRepository } from '../../src/core/ports/UserRepository';
import { User, Provider } from '../../src/core/types/persistence/UserPersistence';
import { NotFoundError, UpstreamError } from '../../src/shared/errors/domain';

/**
 * UserRepository의 인메모리 모의 구현체.
 * 실제 DB에 접근하지 않고 테스트를 위해 메모리 상에서 데이터를 관리합니다.
 */
class InMemoryUserRepo implements UserRepository {
  private users = new Map<string, User>();
  private nextId = 1;

  /** 테스트용 사용자를 미리 채워넣습니다. */
  public async seed(user: Partial<Parameters<typeof this.create>[0]>) {
    const newUser = await this.create({
      provider: 'google',
      providerUserId: `provider-id-${this.nextId}`,
      ...user,
    });
    return newUser;
  }

  async findById(id: string): Promise<User | null> {
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

  public async create(data: {
    provider: Provider;
    providerUserId: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    const id = String(this.nextId++);
    const user = new User({
      id: id,
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

  /** 테스트 데이터 초기화를 위한 헬퍼 메서드 */
  public clear() {
    this.users.clear();
    this.nextId = 1;
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
      const userProfile = await userService.getUserProfile(user.id.toString());

      expect(userProfile).toBeDefined();
      expect(userProfile.id).toBe(user.id);
      expect(userProfile.displayName).toBe('Test User');
    });

    it('should throw NotFoundError for an invalid ID', async () => {
      await expect(userService.getUserProfile("999")).rejects.toThrow(NotFoundError);
    });

    it('should throw UpstreamError when repository fails unexpectedly', async () => {
      const errorMessage = 'Database connection lost';
      jest.spyOn(userRepo, 'findById').mockRejectedValueOnce(new Error(errorMessage));

      const promise = userService.getUserProfile("1");
      
      await expect(promise).rejects.toThrow(UpstreamError);
      // The cause check is tricky with Jest's toHaveProperty for nested properties on rejected objects.
      // A safer way is to catch and inspect.
      try {
        await promise;
      } catch (e) {
        expect(e).toBeInstanceOf(UpstreamError);
        expect((e as UpstreamError).message).toBe(errorMessage);
      }
    });
  });

  test('findOrCreateFromProvider should create a new user if not exists', async () => {
    const profile = { id: 'provider-id-new', displayName: 'New User', email: 'new@example.com', avatarUrl: null };
    const user = await userService.findOrCreateFromProvider('google', profile);
    expect(user.displayName).toBe('New User');
    const found = await userRepo.findById(user.id);
    expect(found).toBeDefined();
  });

  test('findOrCreateFromProvider should return existing user', async () => {
    const existingUser = await userRepo.seed({ providerUserId: 'provider-id-exists', displayName: 'Existing User' });
    const profile = { id: 'provider-id-exists', displayName: 'Updated User', email: null, avatarUrl: null };
    const user = await userService.findOrCreateFromProvider('google', profile);
    expect(user.id).toBe(existingUser.id);
  });

  test('findById should return a user that exists', async () => {
    const createdUser = await userRepo.seed({ displayName: 'Test User' });
    const user = await userService.findById(createdUser.id);
    expect(user).toBeDefined();
    expect(user!.id).toBe(createdUser.id);
  });

  test('findById should return null if user does not exist', async () => {
    const user = await userService.findById('non-existent-id');
    expect(user).toBeNull();
  });
});
