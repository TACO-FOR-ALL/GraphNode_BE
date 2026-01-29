import { User, Provider } from '../../core/types/persistence/UserPersistence';
import { UserRepository } from '../../core/ports/UserRepository';
import prisma from '../db/prisma';
import { ApiKeyModel } from '../../shared/dtos/me';

/**
 * UserRepository (Prisma 구현)
 * 기존 UserRepositoryMySQL을 대체하며, PrismaClient를 사용합니다.
 */
export class UserRepositoryMySQL implements UserRepository {
  /**
   * id로 단건 조회.
   * @param id 내부 사용자 식별자 (number)
   */
  async findById(id: number): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(id) },
    });
    if (!user) return null;
    return this.mapUser(user);
  }

  /**
   * 내부 사용자 식별자로 API Key 조회
   */
  async findApiKeyById(id: number, model: ApiKeyModel): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(id) },
    });
    if (!user) return null;

    switch (model) {
      case 'openai':
        return user.apiKeyOpenai;
      case 'deepseek':
        return user.apiKeyDeepseek;
      case 'claude':
        return user.apiKeyClaude ?? null; // Prisma types might not update instantly in IDE, using ?? null for safety
      case 'gemini':
        return user.apiKeyGemini ?? null;
      default:
        return null;
    }
  }

  /**
   * 내부 사용자 식별자로 API Key 업데이트
   */
  async updateApiKeyById(id: number, model: ApiKeyModel, apiKey: string): Promise<void> {
    const data: any = {};
    switch (model) {
      case 'openai':
        data.apiKeyOpenai = apiKey;
        break;
      case 'deepseek':
        data.apiKeyDeepseek = apiKey;
        break;
      case 'claude':
        data.apiKeyClaude = apiKey;
        break;
      case 'gemini':
        data.apiKeyGemini = apiKey;
        break;
    }

    await prisma.user.update({
      where: { id: BigInt(id) },
      data,
    });
  }

  /**
   * 내부 사용자 식별자로 API Key 삭제
   */
  async deleteApiKeyById(id: number, model: ApiKeyModel): Promise<void> {
    const data: any = {};
    switch (model) {
      case 'openai':
        data.apiKeyOpenai = null;
        break;
      case 'deepseek':
        data.apiKeyDeepseek = null;
        break;
      case 'claude':
        data.apiKeyClaude = null;
        break;
      case 'gemini':
        data.apiKeyGemini = null;
        break;
    }

    await prisma.user.update({
      where: { id: BigInt(id) },
      data,
    });
  }

  /**
   * provider + provider_user_id로 단건 조회.
   */
  async findByProvider(provider: Provider, providerUserId: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId,
        },
      },
    });
    if (!user) return null;
    return this.mapUser(user);
  }

  /**
   * 사용자 생성
   */
  async create(input: {
    provider: Provider;
    providerUserId: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    const user = await prisma.user.create({
      data: {
        provider: input.provider,
        providerUserId: input.providerUserId,
        email: input.email,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
      },
    });
    return this.mapUser(user);
  }

  /**
   * findOrCreateFromProvider
   */
  async findOrCreateFromProvider(input: {
    provider: Provider;
    providerUserId: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    // upsert is possible, but last_login_at logic in legacy code was:
    // If exists -> update last_login_at, return object with new last_login_at
    // If new -> create

    // Using simple upsert logic or manual verify as before to keep exact behavior
    const existing = await this.findByProvider(input.provider, input.providerUserId);
    if (existing) {
      const updated = await prisma.user.update({
        where: { id: BigInt(existing.id) },
        data: { lastLoginAt: new Date() },
      });
      return this.mapUser(updated);
    }
    return this.create(input);
  }

  /**
   * Prisma User -> Domain User 매핑
   */
  private mapUser(pUser: any): User {
    return new User({
      id: pUser.id.toString(),
      provider: pUser.provider as Provider,
      providerUserId: pUser.providerUserId,
      email: pUser.email,
      displayName: pUser.displayName,
      avatarUrl: pUser.avatarUrl,
      createdAt: pUser.createdAt,
      lastLoginAt: pUser.lastLoginAt,
      apiKeyOpenai: pUser.apiKeyOpenai,
      apiKeyDeepseek: pUser.apiKeyDeepseek,
      apiKeyClaude: pUser.apiKeyClaude,
      apiKeyGemini: pUser.apiKeyGemini,
    });
  }
}
