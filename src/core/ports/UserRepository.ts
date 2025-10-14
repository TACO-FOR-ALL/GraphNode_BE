import { User } from '../domain/User';

/**
 * UserRepository Port
 * 책임: 사용자 영속성 접근(서비스가 의존).
 * 주의: 구현체는 infra 레이어에 존재.
 */
export interface UserRepository {
  /**
   * 사용자 ID로 단건 조회
   * @param id 내부 사용자 식별자(AUTO_INCREMENT)
   * @returns User 또는 null
  * @example
  * const user = await repo.findById(1);
   */
  findById(id: number): Promise<User | null>;
  /**
   * provider + providerUserId로 단건 조회
   * @param provider 소셜 로그인 제공자('google' | 'apple')
   * @param providerUserId 제공자 측 사용자 식별자
   * @returns User 또는 null
  * @example
  * const user = await repo.findByProvider('google', '123');
   */
  findByProvider(provider: 'google'|'apple', providerUserId: string): Promise<User | null>;
  /**
   * 신규 사용자 생성
   * @param input provider, providerUserId, email 등 프로필 필드
   * @returns 생성된 User 엔티티
  * @example
  * const user = await repo.create({ provider: 'google', providerUserId: '123' });
   */
  create(input: {
    provider: 'google'|'apple';
    providerUserId: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User>;
}
