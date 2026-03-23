/**
 * SessionStoreRedis 단위 테스트
 * - Redis ZSET 기반 세션 저장소(addSession, hasSession, removeSession 등) 검증
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Redis ZSET 명령 모킹
const mockZadd = jest.fn<any>();
const mockZrem = jest.fn<any>();
const mockZcard = jest.fn<any>();
const mockZscore = jest.fn<any>();
const mockZrange = jest.fn<any>();
const mockZremrangebyrank = jest.fn<any>();
const mockExpire = jest.fn<any>();

jest.mock('../../src/infra/redis/client', () => ({
  redis: {
    zadd: (...args: any[]) => mockZadd(...args),
    zrem: (...args: any[]) => mockZrem(...args),
    zcard: (...args: any[]) => mockZcard(...args),
    zscore: (...args: any[]) => mockZscore(...args),
    zrange: (...args: any[]) => mockZrange(...args),
    zremrangebyrank: (...args: any[]) => mockZremrangebyrank(...args),
    expire: (...args: any[]) => mockExpire(...args),
  },
}));

import {
  addSession,
  hasSession,
  hasSessionBySessionId,
  removeSession,
  replaceSession,
  listSessions,
  removeSessionById,
} from '../../src/infra/redis/SessionStoreRedis';

describe('SessionStoreRedis', () => {
  beforeEach(() => {
    // 각 테스트 전 모킹 초기화 및 기본 반환값 설정
    jest.clearAllMocks();
    mockZcard.mockResolvedValue(0);
    mockZadd.mockResolvedValue(1);
    mockZrem.mockResolvedValue(1);
    mockZscore.mockResolvedValue(null);
    mockZrange.mockResolvedValue([]);
    mockZremrangebyrank.mockResolvedValue(0);
    mockExpire.mockResolvedValue(1);
  });

  describe('addSession', () => {
    it('세션을 ZSET에 추가하고 TTL을 설정한다', async () => {
      mockZcard.mockResolvedValue(0);

      await addSession('user-1', 'token-abc');

      expect(mockZcard).toHaveBeenCalledWith('user:user-1:sessions');
      expect(mockZadd).toHaveBeenCalledWith(
        'user:user-1:sessions',
        expect.any(Number),
        'token-abc'
      );
      expect(mockExpire).toHaveBeenCalled();
      expect(mockZremrangebyrank).not.toHaveBeenCalled();
    });

    it('동시 접속 수 초과 시 가장 오래된 세션을 제거한다 (기본 제한 1)', async () => {
      mockZcard.mockResolvedValue(1);

      await addSession('user-1', 'token-new');

      expect(mockZremrangebyrank).toHaveBeenCalledWith('user:user-1:sessions', 0, 0);
      expect(mockZadd).toHaveBeenCalled();
    });
  });

  describe('hasSessionBySessionId', () => {
    it('sessionId에 해당하는 세션이 Redis에 있으면 true를 반환한다', async () => {
      const crypto = require('crypto');
      const token = 'my-refresh-token';
      const sessionId = crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
      mockZrange.mockResolvedValue([token]);

      const result = await hasSessionBySessionId('user-1', sessionId);

      expect(result).toBe(true);
      expect(mockZrange).toHaveBeenCalledWith('user:user-1:sessions', 0, -1);
    });

    it('sessionId에 해당하는 세션이 없으면 false를 반환한다', async () => {
      mockZrange.mockResolvedValue(['other-token']);

      const result = await hasSessionBySessionId('user-1', 'nonexistent-session-id');

      expect(result).toBe(false);
    });

    it('세션이 비어 있으면 false를 반환한다', async () => {
      mockZrange.mockResolvedValue([]);

      const result = await hasSessionBySessionId('user-1', 'any-session-id');

      expect(result).toBe(false);
    });
  });

  describe('hasSession', () => {
    it('세션이 Redis에 존재하면 true를 반환한다', async () => {
      mockZscore.mockResolvedValue('1711000000000');

      const result = await hasSession('user-1', 'token-abc');

      expect(result).toBe(true);
      expect(mockZscore).toHaveBeenCalledWith('user:user-1:sessions', 'token-abc');
    });

    it('세션이 없으면 false를 반환한다', async () => {
      mockZscore.mockResolvedValue(null);

      const result = await hasSession('user-1', 'token-abc');

      expect(result).toBe(false);
    });
  });

  describe('removeSession', () => {
    it('Refresh Token에 해당하는 세션을 Redis에서 제거한다', async () => {
      await removeSession('user-1', 'token-abc');

      expect(mockZrem).toHaveBeenCalledWith('user:user-1:sessions', 'token-abc');
    });
  });

  describe('replaceSession', () => {
    it('기존 토큰을 제거하고 새 토큰을 추가한다 (Refresh Token Rotation)', async () => {
      mockZcard.mockResolvedValue(0);

      await replaceSession('user-1', 'old-token', 'new-token');

      expect(mockZrem).toHaveBeenCalledWith('user:user-1:sessions', 'old-token');
      expect(mockZadd).toHaveBeenCalledWith(
        'user:user-1:sessions',
        expect.any(Number),
        'new-token'
      );
    });
  });

  describe('listSessions', () => {
    it('세션 목록을 반환하며 sessionId, createdAt, isCurrent를 포함한다', async () => {
      const token1 = 'tok1';
      const token2 = 'tok2';
      mockZrange.mockResolvedValue([token2, '1711000002000', token1, '1711000001000']);

      const result = await listSessions('user-1', token1);

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toHaveLength(16);
      expect(result[0].isCurrent).toBe(false);
      expect(result[1].sessionId).toHaveLength(16);
      expect(result[1].isCurrent).toBe(true);
      expect(mockZrange).toHaveBeenCalledWith(
        'user:user-1:sessions',
        0,
        -1,
        'REV',
        'WITHSCORES'
      );
    });

    it('세션이 없으면 빈 배열을 반환한다', async () => {
      mockZrange.mockResolvedValue([]);

      const result = await listSessions('user-1', undefined);

      expect(result).toEqual([]);
    });
  });

  describe('removeSessionById', () => {
    it('sessionId로 매칭되는 세션을 제거한다 (특정 기기 로그아웃)', async () => {
      const crypto = require('crypto');
      const token = 'my-secret-token';
      const sessionId = crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
      mockZrange.mockResolvedValue([token]);

      const result = await removeSessionById('user-1', sessionId);

      expect(result).toBe(1);
      expect(mockZrem).toHaveBeenCalledWith('user:user-1:sessions', token);
    });

    it('sessionId가 없으면 0을 반환한다', async () => {
      mockZrange.mockResolvedValue(['other-token']);

      const result = await removeSessionById('user-1', 'nonexistent-session-id');

      expect(result).toBe(0);
      expect(mockZrem).not.toHaveBeenCalled();
    });
  });
});
