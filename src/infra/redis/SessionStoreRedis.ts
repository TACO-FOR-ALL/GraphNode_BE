/**
 * 모듈: Redis 기반 세션 저장소
 * 책임:
 * - 사용자별 Refresh Token 세션을 Redis ZSET으로 관리
 * - 동시 접속 기기 수 제한 (MAX_CONCURRENT_SESSIONS)
 * - 특정 기기(세션) 로그아웃 지원
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
 * 세션 정보 (목록 조회용)
 */
export interface SessionInfo {
  sessionId: string;
  createdAt: number;
  isCurrent: boolean;
}

/**
 * Refresh Token에서 세션 식별자 생성 (16자 hex)
 */
export function toSessionId(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
}

function getSessionKey(userId: string): string {
  return `${SESSION_KEY_PREFIX}${userId}${SESSION_KEY_SUFFIX}`;
}

/**
 * 세션 추가. 제한 초과 시 가장 오래된 세션 제거 후 추가.
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
    logger.debug({ userId, sessionId: toSessionId(refreshToken) }, 'Session added');
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.addSession failed');
    throw error;
  }
}

/**
 * sessionId로 세션 유효 여부 확인 (Access Token 검증용)
 * - Access Token에는 refresh token이 없으므로 sessionId로 Redis 검증
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
    logger.error({ err: error, userId }, 'SessionStoreRedis.hasSessionBySessionId failed');
    return false;
  }
}

/**
 * 세션이 유효한지 확인 (Redis에 존재하는지)
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
    logger.error({ err: error, userId }, 'SessionStoreRedis.hasSession failed');
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
    logger.debug({ userId, sessionId: toSessionId(refreshToken) }, 'Session removed');
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.removeSession failed');
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
    logger.error({ err: error, userId }, 'SessionStoreRedis.replaceSession failed');
    throw error;
  }
}

/**
 * 사용자의 세션 목록 조회 (최신순)
 * @param currentToken 현재 요청의 Refresh Token (isCurrent 판별용)
 */
export async function listSessions(
  userId: string,
  currentToken: string | undefined
): Promise<SessionInfo[]> {
  const key = getSessionKey(userId);
  try {
    const rows = await withRetry(
      async () => redis.zrange(key, 0, -1, 'REV', 'WITHSCORES'),
      { label: 'SessionStoreRedis.listSessions' }
    );

    const result: SessionInfo[] = [];
    for (let i = 0; i < rows.length; i += 2) {
      const token = rows[i];
      const score = parseInt(rows[i + 1], 10);
      result.push({
        sessionId: toSessionId(token),
        createdAt: score,
        isCurrent: !!currentToken && token === currentToken,
      });
    }
    return result;
  } catch (error) {
    logger.error({ err: error, userId }, 'SessionStoreRedis.listSessions failed');
    throw error;
  }
}

/**
 * sessionId로 특정 세션 제거 (특정 기기 로그아웃)
 * @returns 제거된 세션 수 (0 = 없음)
 */
export async function removeSessionById(userId: string, sessionId: string): Promise<number> {
  const key = getSessionKey(userId);
  try {
    const rows = await withRetry(
      async () => redis.zrange(key, 0, -1),
      { label: 'SessionStoreRedis.removeSessionById.zrange' }
    );

    const target = rows.find((token) => toSessionId(token) === sessionId);
    if (!target) return 0;

    await withRetry(
      async () => redis.zrem(key, target),
      { label: 'SessionStoreRedis.removeSessionById.zrem' }
    );
    logger.debug({ userId, sessionId }, 'Session removed by id');
    return 1;
  } catch (error) {
    logger.error({ err: error, userId, sessionId }, 'SessionStoreRedis.removeSessionById failed');
    throw error;
  }
}
