import { User } from '../domain/User';

/**
 * UserRepository 포트(Port)
 * 책임: 서비스가 의존하는 사용자 영속성 인터페이스 정의.
 * 주의: 구현체는 infra 레이어에 위치해야 하며, 서비스/도메인은 프레임워크에 비의존.
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

  /**
   * provider/provUserId 기준으로 find-or-create.
   * 존재하면 last_login_at 갱신, 없으면 신규 생성.
   * @param input.provider 제공자('google'|'apple')
   * @param input.providerUserId 제공자 측 사용자 식별자
   * @param input.email 이메일(선택)
   * @param input.displayName 표시 이름(선택)
   * @param input.avatarUrl 아바타 URL(선택)
   * @returns User 엔티티(불변 접근자 제공)
   */
  findOrCreateFromProvider(input: {
    provider: 'google'|'apple';
    providerUserId: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User>;
}
