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
const SESSION_TTL_SEC = Math.floor(JWT_REFRESH_EXPIRY_MS / 1000);

/**
 * Refresh Token에서 세션 식별자 생성 (16자 hex)
 * Access Token의 sessionId와 매칭하여 Redis 세션 검증에 사용
 */
export function toSessionId(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
}

function getSessionKey(userId: string): string {
  return `${SESSION_KEY_PREFIX}${userId}${SESSION_KEY_SUFFIX}`;
}

/**
 * 세션 추가.
 * 제한 초과 시 가장 오래된 세션을 제거한 뒤 새 세션 추가
 */
export async function addSession(userId: string, refreshToken: string): Promise<void> {
  const key = getSessionKey(userId);
  const score = Date.now();
  const member = refreshToken;
  const maxSessions = env.MAX_CONCURRENT_SESSIONS;

  try {
    await withRetry(
      async () => {
        const count = await redis.zcard(key);
        const toRemove = count - maxSessions + 1;
        if (toRemove > 0) {
          await redis.zremrangebyrank(key, 0, toRemove - 1);
        }
        await redis.zadd(key, score, member);
        await redis.expire(key, SESSION_TTL_SEC);
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
 */
export async function hasSessionBySessionId(userId: string, sessionId: string): Promise<boolean> {
  const key = getSessionKey(userId);
  try {
    const rows = await withRetry(
      async () => redis.zrange(key, 0, -1),
      { label: 'SessionStoreRedis.hasSessionBySessionId' }
    );
    const found = rows.some((token) => toSessionId(token) === sessionId);
    return found;
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.hasSessionBySessionId 실패');
    return false;
  }
}

/**
 * Refresh Token으로 세션 유효 여부 확인 (리프레시 시 검증용)
 */
export async function hasSession(userId: string, refreshToken: string): Promise<boolean> {
  const key = getSessionKey(userId);
  try {
    const score = await withRetry(
      async () => redis.zscore(key, refreshToken),
      { label: 'SessionStoreRedis.hasSession' }
    );
    return score !== null;
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.hasSession 실패');
    return false;
  }
}

/**
 * 세션 제거 (로그아웃)
 */
export async function removeSession(userId: string, refreshToken: string): Promise<void> {
  const key = getSessionKey(userId);
  try {
    await withRetry(
      async () => redis.zrem(key, refreshToken),
      { label: 'SessionStoreRedis.removeSession' }
    );
    logger.debug({ userId, sessionId: toSessionId(refreshToken) }, '세션 제거됨');
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.removeSession 실패');
    throw error;
  }
}

/**
 * 기존 세션을 새 세션으로 교체 (Refresh Token Rotation 시)
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
        await redis.zrem(key, oldToken);
        const count = await redis.zcard(key);
        const toRemove = count - maxSessions + 1;
        if (toRemove > 0) {
          await redis.zremrangebyrank(key, 0, toRemove - 1);
        }
        await redis.zadd(key, score, newToken);
        await redis.expire(key, SESSION_TTL_SEC);
      },
      { label: 'SessionStoreRedis.replaceSession' }
    );
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.replaceSession 실패');
    throw error;
  }
}
