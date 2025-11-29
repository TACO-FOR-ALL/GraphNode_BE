import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

import { User, Provider } from '../../core/types/persistence/UserPersistence';
import { UserRepository } from '../../core/ports/UserRepository';
import { getMySql } from '../db/mysql';

/**
 * UserRepository (MySQL 구현)
 * @remarks
 * - 테이블: users(id, provider, provider_user_id, email, display_name, avatar_url, created_at, last_login_at)
 * - 제약: UNIQUE(provider, provider_user_id)
 */
export class UserRepositoryMySQL implements UserRepository {
  /**
   * id로 단건 조회.
   * @param id 내부 사용자 식별자
   * @returns User 또는 null
   */
  async findById(id: number): Promise<User | null> {
    const [rows] = await getMySql().query<RowDataPacket[]>('SELECT * FROM users WHERE id=?', [id]);
    if (rows.length === 0) return null;
    return mapUser(rows[0]);
  }

  /**
   * provider + provider_user_id로 단건 조회.
   * @param provider 제공자
   * @param providerUserId 제공자 측 사용자 ID
   * @returns User 또는 null
   */
  async findByProvider(provider: Provider, providerUserId: string): Promise<User | null> {
    const [rows] = await getMySql().query<RowDataPacket[]>(
      'SELECT * FROM users WHERE provider=? AND provider_user_id=?',
      [provider, providerUserId]
    );
    if (rows.length === 0) return null;
    return mapUser(rows[0]);
  }

  /**
   * 사용자 생성 후 방금 생성한 레코드를 재조회하여 반환.
   * @param input provider/providerUserId/프로필 필드
   * @returns 생성된 User 엔티티
   */
  async create(input: { provider: Provider; providerUserId: string; email?: string | null; displayName?: string | null; avatarUrl?: string | null; }): Promise<User> {
    const [res] = await getMySql().query<ResultSetHeader>(
      'INSERT INTO users(provider, provider_user_id, email, display_name, avatar_url) VALUES (?,?,?,?,?)',
      [input.provider, input.providerUserId, input.email ?? null, input.displayName ?? null, input.avatarUrl ?? null]
    );
    const [rows] = await getMySql().query<RowDataPacket[]>('SELECT * FROM users WHERE id=?', [res.insertId]);
    return mapUser(rows[0]);
  }

  /**
   * provider+provider_user_id 기준으로 레코드를 조회하고, 없으면 생성한다.
   * @param input.provider 제공자
   * @param input.providerUserId 제공자 측 사용자 ID
   * @param input.email 이메일(선택)
   * @param input.displayName 표시 이름(선택)
   * @param input.avatarUrl 아바타 URL(선택)
   * @returns User 엔티티
   */
  async findOrCreateFromProvider(input: { provider: Provider; providerUserId: string; email?: string | null; displayName?: string | null; avatarUrl?: string | null; }): Promise<User> {
    const existing = await this.findByProvider(input.provider, input.providerUserId);
    if (existing) {
      await getMySql().query('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?', [existing.id]);
        return new User({
          id: existing.id,
          provider: existing.provider,
          providerUserId: existing.providerUserId,
          email: existing.email,
          displayName: existing.displayName,
          avatarUrl: existing.avatarUrl,
          createdAt: existing.createdAt,
          lastLoginAt: new Date()
        });
    }
    return this.create(input);
  }
}

/**
 * RowDataPacket을 User 도메인 엔티티로 매핑한다.
 * @param r MySQL RowDataPacket(컬럼: users.*)
 * @returns User 엔티티(불변)
 */
function mapUser(r: RowDataPacket): User {
  return new User({
    id: String(r.id),
    provider: r.provider as Provider,
    providerUserId: String(r.provider_user_id),
    email: r.email ?? null,
    displayName: r.display_name ?? null,
    avatarUrl: r.avatar_url ?? null,
    createdAt: new Date(r.created_at),
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at) : null
  });
}
