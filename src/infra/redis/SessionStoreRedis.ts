/**
 * Redis 기반 세션 저장소
 *
 * 책임:
 * - 사용자별 Refresh Token 세션을 Redis ZSET으로 관리
 * - 동시 접속 기기 수 제한 (MAX_CONCURRENT_SESSIONS)
 * - 매 요청 시 세션 유효성 검증 지원 (다중 기기 동시접속 방지)
 */
import crypto from 'crypto';

import { redis } from './client';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { withRetry } from '../../shared/utils/retry';
import { JWT_REFRESH_EXPIRY_MS } from '../../app/utils/jwt';

const env = loadEnv();

const SESSION_KEY_PREFIX = 'user:';
const SESSION_KEY_SUFFIX = ':sessions';
const SESSION_TTL_SEC = Math.floor(JWT_REFRESH_EXPIRY_MS / 1000); // Redis 키 만료 시간

/**
 * Refresh Token에서 세션 식별자 생성 (16자 hex)
 * Access Token의 sessionId와 매칭하여 Redis 세션 검증에 사용
 * @param token refresh token
 * @returns session id
 */
export function toSessionId(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
}

/**
 * Redis 세션 키 생성
 * @param userId 사용자 ID
 * @returns Redis 세션 키
 */
function getSessionKey(userId: string): string {
  return `${SESSION_KEY_PREFIX}${userId}${SESSION_KEY_SUFFIX}`;
}

/**
 * 세션 추가.
 * 제한 초과 시 가장 오래된 세션을 제거한 뒤 새 세션 추가
 * @param userId 사용자 ID
 * @param refreshToken refresh token
 */
export async function addSession(userId: string, refreshToken: string): Promise<void> {
  const key = getSessionKey(userId);
  const score = Date.now();
  const member = refreshToken;
  const maxSessions = env.MAX_CONCURRENT_SESSIONS;

  try {
    await withRetry(
      async () => {
        const count = await redis.zcard(key); // Redis sorted set에 저장된 요소 개수 반환
        const toRemove = count - maxSessions + 1;
        if (toRemove > 0) {
          await redis.zremrangebyrank(key, 0, toRemove - 1); // 가장 오래된 세션 제거
        }
        await redis.zadd(key, score, member); // 새 세션 추가
        await redis.expire(key, SESSION_TTL_SEC); // Redis 키 만료 시간 설정
      },
      { label: 'SessionStoreRedis.addSession' }
    );
    logger.debug({ userId, sessionId: toSessionId(refreshToken) }, '세션 추가됨');
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.addSession 실패');
    throw error;
  }
}

/**
 * sessionId로 세션 유효 여부 확인 (Access Token 검증용)
 * Access Token에는 refresh token이 없으므로 sessionId로 Redis 검증
 * @param userId 사용자 ID
 * @param sessionId session id
 * @returns 세션 유효 여부
 */
export async function hasSessionBySessionId(userId: string, sessionId: string): Promise<boolean> {
  const key = getSessionKey(userId);
  try {
    // Redis sorted set에서 모든 세션 가져오기
    const rows: string[] = await withRetry(async () => redis.zrange(key, 0, -1), {
      label: 'SessionStoreRedis.hasSessionBySessionId',
    });

    // sessionId로 세션 유효 여부 확인
    const found: boolean = rows.some((token) => toSessionId(token) === sessionId);
    return found;
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.hasSessionBySessionId 실패');
    return false;
  }
}

/**
 * Refresh Token으로 세션 유효 여부 확인 (리프레시 시 검증용)
 * @param userId 사용자 ID
 * @param refreshToken refresh token
 * @returns 세션 유효 여부
 */
export async function hasSession(userId: string, refreshToken: string): Promise<boolean> {
  const key = getSessionKey(userId);
  try {
    // Redis sorted set에서 refresh token의 score 가져오기
    const score = await withRetry(async () => redis.zscore(key, refreshToken), {
      label: 'SessionStoreRedis.hasSession',
    });
    return score !== null;
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.hasSession 실패');
    return false;
  }
}

/**
 * 세션 제거 (로그아웃)
 * @param userId 사용자 ID
 * @param refreshToken refresh token
 */
export async function removeSession(userId: string, refreshToken: string): Promise<void> {
  const key = getSessionKey(userId);
  try {
    await withRetry(async () => redis.zrem(key, refreshToken), {
      label: 'SessionStoreRedis.removeSession',
    });
    logger.debug({ userId, sessionId: toSessionId(refreshToken) }, '세션 제거됨');
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.removeSession 실패');
    throw error;
  }
}

/**
 * 사용자 세션 목록 조회
 * - Redis ZSET에서 해당 사용자의 모든 Refresh Token을 꺼내 sessionId, createdAt으로 변환
 * @param userId 사용자 ID
 * @returns sessionId, createdAt 목록 (오래된 순)
 */
export async function listSessions(
  userId: string
): Promise<Array<{ sessionId: string; createdAt: string }>> {
  const key = getSessionKey(userId);
  try {
    const tokens: string[] = await withRetry(async () => redis.zrange(key, 0, -1), {
      label: 'SessionStoreRedis.listSessions',
    });

    const rows = await Promise.all(
      tokens.map(async (token) => {
        const score = await withRetry(async () => redis.zscore(key, token), {
          label: 'SessionStoreRedis.listSessions.zscore',
        });
        const createdAtMs = score ? Number(score) : Date.now();
        return {
          sessionId: toSessionId(token),
          createdAt: new Date(createdAtMs).toISOString(),
        };
      })
    );

    return rows;
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.listSessions 실패');
    return [];
  }
}

/**
 * sessionId로 특정 세션 강제 제거 (특정 기기 로그아웃)
 * @param userId 사용자 ID
 * @param sessionId 제거할 세션 ID (16자 hex)
 * @returns 실제 제거 여부 (없으면 false)
 */
export async function removeSessionBySessionId(userId: string, sessionId: string): Promise<boolean> {
  const key = getSessionKey(userId);
  try {
    const tokens: string[] = await withRetry(async () => redis.zrange(key, 0, -1), {
      label: 'SessionStoreRedis.removeSessionBySessionId',
    });
    const token = tokens.find((t) => toSessionId(t) === sessionId);
    if (!token) return false;
    const removed = await withRetry(async () => redis.zrem(key, token), {
      label: 'SessionStoreRedis.removeSessionBySessionId.zrem',
    });
    return removed > 0;
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.removeSessionBySessionId 실패');
    return false;
  }
}

/**
 * 기존 세션을 새 세션으로 교체 (Refresh Token Rotation 시)
 * @param userId 사용자 ID
 * @param oldToken old refresh token
 * @param newToken new refresh token
 */
export async function replaceSession(
  userId: string,
  oldToken: string,
  newToken: string
): Promise<void> {
  const key = getSessionKey(userId);
  const maxSessions = env.MAX_CONCURRENT_SESSIONS;
  const score = Date.now();

  try {
    await withRetry(
      async () => {
        // 기존 세션 제거
        await redis.zrem(key, oldToken);
        // Redis sorted set에 저장된 요소 개수 반환
        const count: number = await redis.zcard(key);
        // 제거할 세션 수 계산
        const toRemove: number = count - maxSessions + 1;
        // 제거할 세션 수 > 0 이면 가장 오래된 세션 제거
        if (toRemove > 0) {
          await redis.zremrangebyrank(key, 0, toRemove - 1);
        }
        // 새 세션 추가
        await redis.zadd(key, score, newToken);
        // Redis 키 만료 시간 설정
        await redis.expire(key, SESSION_TTL_SEC);
      },
      { label: 'SessionStoreRedis.replaceSession' }
    );
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.replaceSession 실패');
    throw error;
  }
}
