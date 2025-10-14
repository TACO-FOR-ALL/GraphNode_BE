import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

import { User, Provider } from '../../core/domain/User';
import { UserRepository } from '../../core/ports/UserRepository';
import { getMySql } from '../db/mysql';

/**
 * UserRepository (MySQL 구현)
 * - 테이블: users
 * - 주키: AUTO_INCREMENT id
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
}

/**
 * RowDataPacket을 User 도메인 엔티티로 매핑한다.
 * @param r MySQL RowDataPacket
 * @returns User 엔티티
 */
function mapUser(r: RowDataPacket): User {
  return new User({
    id: Number(r.id),
    provider: r.provider as Provider,
    providerUserId: String(r.provider_user_id),
    email: r.email ?? null,
    displayName: r.display_name ?? null,
    avatarUrl: r.avatar_url ?? null,
    createdAt: new Date(r.created_at),
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at) : null
  });
}
