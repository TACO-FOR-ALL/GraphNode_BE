import { UserRepository } from '../ports/UserRepository';
import { UserProfileDto } from '../../shared/dtos/me';
import { NotFoundError, ValidationError, UpstreamError } from '../../shared/errors/domain';
import { User } from '../types/persistence/UserPersistence';

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
}
