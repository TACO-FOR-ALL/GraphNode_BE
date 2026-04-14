import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { DailyUsageService } from '../../src/core/services/DailyUsageService';
import type { DailyUsageRepository } from '../../src/core/ports/DailyUsageRepository';
import { DailyUsage } from '../../src/core/types/persistence/usage.persistence';
import { RateLimitError, UpstreamError } from '../../src/shared/errors/domain';

describe('DailyUsageService', () => {
  let service: DailyUsageService;
  let mockRepo: jest.Mocked<DailyUsageRepository>;

  const userId = 'user-1';
  const fixedNow = new Date('2026-04-13T15:23:45.678Z');
  const todayUtcMidnight = new Date('2026-04-13T00:00:00.000Z');
  const yesterdayUtcMidnight = new Date('2026-04-12T00:00:00.000Z');

  const createUsage = (overrides?: Partial<ConstructorParameters<typeof DailyUsage>[0]>) =>
    new DailyUsage({
      id: 'usage-1',
      userId,
      lastResetDate: todayUtcMidnight,
      chatCount: 1,
      ...overrides,
    });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
    process.env.NODE_ENV = 'test';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.CLAUDE_API_KEY = 'test-claude-key';

    mockRepo = {
      findByUser: jest.fn(),
      upsertForToday: jest.fn(),
    };

    service = new DailyUsageService(mockRepo);
    service.DAILY_CHAT_LIMIT = 3;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── checkLimit ────────────────────────────────────────────────────────────

  describe('checkLimit', () => {
    it('passes silently and does not write when no usage exists (new user)', async () => {
      mockRepo.findByUser.mockResolvedValue(null);

      await expect(service.checkLimit(userId)).resolves.toBeUndefined();

      expect(mockRepo.findByUser).toHaveBeenCalledWith(userId);
      expect(mockRepo.upsertForToday).not.toHaveBeenCalled();
    });

    it('passes silently and does not write when today count is below the limit', async () => {
      mockRepo.findByUser.mockResolvedValue(createUsage({ chatCount: 2 }));

      await expect(service.checkLimit(userId)).resolves.toBeUndefined();

      expect(mockRepo.upsertForToday).not.toHaveBeenCalled();
    });

    it('treats stale usage as zero and passes without writing', async () => {
      // 어제 한도를 꽉 채웠더라도 날짜가 바뀌었으면 통과
      mockRepo.findByUser.mockResolvedValue(
        createUsage({ lastResetDate: yesterdayUtcMidnight, chatCount: 99 })
      );

      await expect(service.checkLimit(userId)).resolves.toBeUndefined();

      expect(mockRepo.upsertForToday).not.toHaveBeenCalled();
    });

    it('throws RateLimitError and does not write when the limit is already reached', async () => {
      mockRepo.findByUser.mockResolvedValue(createUsage({ chatCount: 3 })); // limit === 3

      await expect(service.checkLimit(userId)).rejects.toThrow(RateLimitError);
      expect(mockRepo.upsertForToday).not.toHaveBeenCalled();
    });

    it('wraps repository read failures as UpstreamError', async () => {
      mockRepo.findByUser.mockRejectedValue(new Error('read failed'));

      await expect(service.checkLimit(userId)).rejects.toMatchObject({
        message: 'DailyUsageService.checkLimit failed',
        code: 'UPSTREAM_ERROR',
      });
    });
  });

  // ─── incrementUsage ────────────────────────────────────────────────────────

  describe('incrementUsage', () => {
    it('calls upsertForToday with today UTC midnight', async () => {
      mockRepo.upsertForToday.mockResolvedValue(createUsage({ chatCount: 1 }));

      await service.incrementUsage(userId);

      expect(mockRepo.upsertForToday).toHaveBeenCalledWith(userId, todayUtcMidnight);
    });

    it('wraps repository write failures as UpstreamError', async () => {
      mockRepo.upsertForToday.mockRejectedValue(new Error('write failed'));

      await expect(service.incrementUsage(userId)).rejects.toMatchObject({
        message: 'DailyUsageService.incrementUsage failed',
        code: 'UPSTREAM_ERROR',
      });
    });
  });

  // ─── checkLimit + incrementUsage 분리 보장 ─────────────────────────────────

  describe('checkLimit and incrementUsage separation', () => {
    it('AI 실패 시나리오: checkLimit 통과 후 incrementUsage 미호출 → 카운트 보존', async () => {
      // AI 호출 실패 시 incrementUsage를 호출하지 않으면 카운트가 오르지 않는다
      mockRepo.findByUser.mockResolvedValue(createUsage({ chatCount: 2 }));

      await service.checkLimit(userId); // 통과

      // AI 호출 실패 → incrementUsage 호출 생략
      expect(mockRepo.upsertForToday).not.toHaveBeenCalled();
    });

    it('성공 시나리오: checkLimit 통과 후 incrementUsage 호출 → 카운트 소모', async () => {
      mockRepo.findByUser.mockResolvedValue(createUsage({ chatCount: 2 }));
      mockRepo.upsertForToday.mockResolvedValue(createUsage({ chatCount: 3 }));

      await service.checkLimit(userId);
      await service.incrementUsage(userId); // AI 저장 완료 후 호출

      expect(mockRepo.upsertForToday).toHaveBeenCalledWith(userId, todayUtcMidnight);
    });
  });

  // ─── getRemainingCount ─────────────────────────────────────────────────────

  describe('getRemainingCount', () => {
    it('returns the full daily limit when no usage exists', async () => {
      mockRepo.findByUser.mockResolvedValue(null);

      await expect(service.getRemainingCount(userId)).resolves.toBe(3);
      expect(mockRepo.findByUser).toHaveBeenCalledWith(userId);
    });

    it('subtracts today usage from the daily limit', async () => {
      mockRepo.findByUser.mockResolvedValue(createUsage({ chatCount: 2 }));

      await expect(service.getRemainingCount(userId)).resolves.toBe(1);
    });

    it('treats stale usage as reset and returns the full daily limit', async () => {
      mockRepo.findByUser.mockResolvedValue(
        createUsage({ lastResetDate: yesterdayUtcMidnight, chatCount: 999 })
      );

      await expect(service.getRemainingCount(userId)).resolves.toBe(3);
    });

    it('never returns a negative number even if stored count exceeds the limit', async () => {
      mockRepo.findByUser.mockResolvedValue(createUsage({ chatCount: 100 }));

      await expect(service.getRemainingCount(userId)).resolves.toBe(0);
    });

    it('wraps repository failures as UpstreamError', async () => {
      mockRepo.findByUser.mockRejectedValue(new Error('read failed'));

      await expect(service.getRemainingCount(userId)).rejects.toMatchObject({
        message: 'DailyUsageService.getRemainingCount failed',
        code: 'UPSTREAM_ERROR',
      });
    });
  });

  // ─── getTodayUsage ─────────────────────────────────────────────────────────

  describe('getTodayUsage', () => {
    it('returns null when no usage exists', async () => {
      mockRepo.findByUser.mockResolvedValue(null);

      await expect(service.getTodayUsage(userId)).resolves.toBeNull();
    });

    it('returns null when the latest usage is from a previous day', async () => {
      mockRepo.findByUser.mockResolvedValue(
        createUsage({ lastResetDate: yesterdayUtcMidnight, chatCount: 5 })
      );

      await expect(service.getTodayUsage(userId)).resolves.toBeNull();
    });

    it('returns today usage as-is when the record is from today', async () => {
      const usage = createUsage({ chatCount: 2 });
      mockRepo.findByUser.mockResolvedValue(usage);

      await expect(service.getTodayUsage(userId)).resolves.toBe(usage);
    });

    it('wraps repository failures as UpstreamError', async () => {
      mockRepo.findByUser.mockRejectedValue(new Error('read failed'));

      await expect(service.getTodayUsage(userId)).rejects.toMatchObject({
        message: 'DailyUsageService.getTodayUsage failed',
        code: 'UPSTREAM_ERROR',
      });
    });
  });
});
