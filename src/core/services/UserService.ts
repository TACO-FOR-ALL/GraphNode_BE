import { UserRepository } from '../ports/UserRepository';
import { UserProfileDto, ApiKeysResponseDto, ApiKeyModel } from '../../shared/dtos/me';
import {
  NotFoundError,
  ValidationError,
  UpstreamError,
  InvalidApiKeyError,
} from '../../shared/errors/domain';
import { User } from '../types/persistence/UserPersistence';
// import { openAI } from '../../shared/openai/index'; // Moved checkAPIKeyValid responsibility to AiProvider or just save it
import { getAiProvider } from '../../shared/ai-providers/index';

/**
 * 사용자 관련 비즈니스 로직을 처리하는 서비스 클래스.
 */
export class UserService {
  /**
   * @param userRepository 사용자 데이터에 접근하기 위한 리포지토리
   */
  constructor(private readonly userRepository: UserRepository) {}

  /**
   * 사용자 ID로 프로필 정보를 조회합니다.
   * @param userId 조회할 사용자의 ID (문자열)
   * @returns 사용자 프로필 DTO
   * @throws {ValidationError} userId가 유효한 숫자 형태가 아닐 경우
   * @throws {NotFoundError} 사용자를 찾지 못한 경우
   * @throws {UpstreamError} 처리 중 예기치 않은 오류 발생 시
   */
  async getUserProfile(userId: string): Promise<UserProfileDto> {
    try {
      if (!userId || !/^\d+$/.test(userId)) {
        throw new ValidationError('User ID must be a valid number string.');
      }
      const numericUserId = parseInt(userId, 10);

      const user: User | null = await this.userRepository.findById(numericUserId);

      if (!user) {
        throw new NotFoundError(`User with id ${userId} not found`);
      }

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      };
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') {
        throw err; // AppError (ValidationError, NotFoundError 등)는 그대로 전달
      }
      // 그 외의 모든 에러는 UpstreamError로 감싸서 처리
      throw new UpstreamError('Failed to get user profile', { cause: err as any });
    }
  }

  /**
   * 사용자의 모든 API Key를 조회합니다.
   * @param userId 사용자 ID
   * @param model API Key 모델 ('openai' | 'deepseek')
   * @returns API Key 값 (없으면 null)
   * @throws {ValidationError} userId가 유효하지 않거나 model이 잘못된 경우
   * @throws {NotFoundError} 사용자를 찾지 못한 경우
   * @throws {ValidationError} model이 잘못된 경우
   */
  async getApiKeys(userId: string, model: ApiKeyModel): Promise<ApiKeysResponseDto> {
    try {
      if (!userId || !/^\d+$/.test(userId)) {
        throw new ValidationError('User ID must be a valid number string.');
      }
      const numericUserId = parseInt(userId, 10);

      const user: User | null = await this.userRepository.findById(numericUserId);

      if (!user) {
        throw new NotFoundError(`User with id ${userId} not found`);
      }

      switch (model) {
        case 'openai':
          return { apiKey: user.apiKeyOpenai ?? null };
        case 'deepseek':
          return { apiKey: user.apiKeyDeepseek ?? null };
        case 'claude':
          return { apiKey: user.apiKeyClaude ?? null };
        case 'gemini':
          return { apiKey: user.apiKeyGemini ?? null };
        default:
          throw new ValidationError('Invalid model');
      }
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') {
        throw err;
      }
      throw new UpstreamError('Failed to get API keys', { cause: err as any });
    }
  }

  /**
   * 사용자의 API Key를 업데이트합니다.
   * @param userId 사용자 ID
   * @param model API Key 모델 ('openai' | 'deepseek')
   * @param apiKey API Key 값
   * @throws {ValidationError} userId가 유효하지 않거나 model이 잘못된 경우
   * @throws {NotFoundError} 사용자를 찾지 못한 경우
   */
  async updateApiKey(userId: string, model: ApiKeyModel, apiKey: string): Promise<void> {
    try {
      // 입력 검증
      if (!userId || !/^\d+$/.test(userId)) {
        throw new ValidationError('User ID must be a valid number string.');
      }

      // 1. 모델 검증
      const allowedModels: ApiKeyModel[] = ['openai', 'deepseek', 'claude', 'gemini'];
      if (!allowedModels.includes(model)) {
        throw new ValidationError('Model must be one of: ' + allowedModels.join(', '));
      }

      // 2. API Key 검증
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        throw new ValidationError('API Key is required and must be a non-empty string.');
      }

      // 3. Provider를 통한 외부 검증
      // if (process.env.NODE_ENV !== 'development') {
      try {
        const provider = getAiProvider(model);
        const result = await provider.checkAPIKeyValid(apiKey);
        if (!result.ok) {
          throw new InvalidApiKeyError(`Invalid API Key for ${model}: ${result.error}`);
        }
      } catch (err: unknown) {
        if (err instanceof InvalidApiKeyError) throw err;
        throw new ValidationError(`Failed to validate API Key for ${model}.`);
      }
      // }

      const numericUserId = parseInt(userId, 10);

      // 사용자 존재 확인
      const user: User | null = await this.userRepository.findById(numericUserId);
      if (!user) {
        throw new NotFoundError(`User with id ${userId} not found`);
      }

      await this.userRepository.updateApiKeyById(numericUserId, model, apiKey.trim());
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') {
        throw err;
      }
      throw new UpstreamError('Failed to update API key', { cause: err as any });
    }
  }

  /**
   * 사용자의 API Key를 삭제합니다.
   * @param userId 사용자 ID
   * @param model API Key 모델 ('openai' | 'deepseek')
   * @throws {ValidationError} userId가 유효하지 않거나 model이 잘못된 경우
   * @throws {NotFoundError} 사용자를 찾지 못한 경우
   */
  async deleteApiKey(userId: string, model: ApiKeyModel): Promise<void> {
    try {
      if (!userId || !/^\d+$/.test(userId)) {
        throw new ValidationError('User ID must be a valid number string.');
      }
      const allowedModels: ApiKeyModel[] = ['openai', 'deepseek', 'claude', 'gemini'];
      if (!allowedModels.includes(model)) {
        throw new ValidationError('Invalid model provided.');
      }

      const numericUserId = parseInt(userId, 10);

      // 사용자 존재 확인
      const user: User | null = await this.userRepository.findById(numericUserId);
      if (!user) {
        throw new NotFoundError(`User with id ${userId} not found`);
      }

      await this.userRepository.deleteApiKeyById(numericUserId, model);
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') {
        throw err;
      }
      throw new UpstreamError('Failed to delete API key', { cause: err as any });
    }
  }
}
