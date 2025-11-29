import { User } from '../types/persistence/UserPersistence';

/**
 * 모듈: UserRepository Port (사용자 저장소 인터페이스)
 * 
 * 책임:
 * - 사용자(User) 데이터의 영속성 계층을 추상화합니다.
 * - 서비스 계층은 이 인터페이스를 통해 사용자 정보를 조회하고 생성합니다.
 * 
 * 주의:
 * - 구현체는 `infra` 레이어에 위치해야 합니다.
 * - 서비스/도메인 로직은 특정 프레임워크나 DB 기술에 의존하지 않아야 합니다.
 */
export interface UserRepository {
  /**
   * 사용자 ID로 단건 조회
   * 
   * @param id 내부 사용자 식별자 (AUTO_INCREMENT)
   * @returns User 객체 또는 null
   * @example
   * const user = await repo.findById(1);
   */
  findById(id: number): Promise<User | null>;

  /**
   * 소셜 로그인 정보로 사용자 조회
   * 
   * @param provider 소셜 로그인 제공자 ('google' | 'apple')
   * @param providerUserId 제공자 측 사용자 식별자
   * @returns User 객체 또는 null
   * @example
   * const user = await repo.findByProvider('google', '123456789');
   */
  findByProvider(provider: 'google'|'apple', providerUserId: string): Promise<User | null>;

  /**
   * 신규 사용자 생성
   * 
   * @param input 사용자 생성 정보 (provider, providerUserId, email 등)
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
   * 소셜 로그인 처리 (Find or Create)
   * 
   * - 이미 존재하는 사용자라면: 마지막 로그인 시간(last_login_at)을 갱신하고 반환합니다.
   * - 존재하지 않는 사용자라면: 신규 사용자를 생성하고 반환합니다.
   * 
   * @param input 사용자 정보
   * @returns User 엔티티
   */
  findOrCreateFromProvider(input: {
    provider: 'google'|'apple';
    providerUserId: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User>;
}
