import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { DailyUsageService } from '../../src/core/services/DailyUsageService';
import type { DailyUsageRepository } from '../../src/core/ports/DailyUsageRepository';
import { DailyUsage } from '../../src/core/types/persistence/usage.persistence';
import { PlanLimitExceededError, UpstreamError } from '../../src/shared/errors/domain';
import { PlanType } from '../../src/core/types/persistence/credit.persistence';

describe('DailyUsageService', () => {
  let service: DailyUsageService;
  let mockRepo: jest.Mocked<DailyUsageRepository>;

  const userId = 'user-1';
  const fixedNow = new Date('2026-04-13T15:23:45.678Z');
  const todayUtcMidnight = new Date('2026-04-13T00:00:00.000Z');
  const yesterdayUtcMidnight = new Date('2026-04-12T00:00:00.000Z');

  const makeUsage = (overrides?: Partial<{ chatTokens: bigint; lastResetDate: Date }>) =>
    new DailyUsage({
      id: 'usage-1',
      userId,
      lastResetDate: overrides?.lastResetDate ?? todayUtcMidnight,
      chatTokens: overrides?.chatTokens ?? 0n,
    });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
    process.env.NODE_ENV = 'test';

    mockRepo = {
      findByUser: jest.fn(),
      addTokens: jest.fn(),
    } as jest.Mocked<DailyUsageRepository>;

    service = new DailyUsageService(mockRepo);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── checkTokenLimit ────────────────────────────────────────────────────────

  describe('checkTokenLimit', () => {
    it('passes when no usage exists (new user)', async () => {
      mockRepo.findByUser.mockResolvedValue(null);
      await expect(service.checkTokenLimit(userId, PlanType.FREE)).resolves.toBeUndefined();
      expect(mockRepo.findByUser).toHaveBeenCalledWith(userId);
    });

    it('passes when today tokens are below the plan limit', async () => {
      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 49_999n }));
      await expect(service.checkTokenLimit(userId, PlanType.FREE)).resolves.toBeUndefined();
    });

    it('throws PlanLimitExceededError when tokens reach the FREE plan limit', async () => {
      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 50_000n }));
      await expect(service.checkTokenLimit(userId, PlanType.FREE)).rejects.toThrow(PlanLimitExceededError);
      expect(mockRepo.addTokens).not.toHaveBeenCalled();
    });

    it('enforces BASIC plan limit of 250,000 tokens', async () => {
      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 249_999n }));
      await expect(service.checkTokenLimit(userId, PlanType.BASIC)).resolves.toBeUndefined();

      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 250_000n }));
      await expect(service.checkTokenLimit(userId, PlanType.BASIC)).rejects.toThrow(PlanLimitExceededError);
    });

    it('enforces PLUS plan limit of 500,000 tokens', async () => {
      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 499_999n }));
      await expect(service.checkTokenLimit(userId, PlanType.PLUS)).resolves.toBeUndefined();

      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 500_000n }));
      await expect(service.checkTokenLimit(userId, PlanType.PLUS)).rejects.toThrow(PlanLimitExceededError);
    });

    it('PRO plan is treated same as BASIC (250,000 token limit)', async () => {
      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 250_000n }));
      await expect(service.checkTokenLimit(userId, PlanType.PRO)).rejects.toThrow(PlanLimitExceededError);
    });

    it('ENTERPRISE plan always passes regardless of token count', async () => {
      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 999_999_999n }));
      await expect(service.checkTokenLimit(userId, PlanType.ENTERPRISE)).resolves.toBeUndefined();
      expect(mockRepo.findByUser).not.toHaveBeenCalled(); // early return before DB read
    });

    it('treats stale usage (yesterday) as zero tokens — passes even at prior-day limit', async () => {
      mockRepo.findByUser.mockResolvedValue(
        makeUsage({ chatTokens: 50_000n, lastResetDate: yesterdayUtcMidnight })
      );
      await expect(service.checkTokenLimit(userId, PlanType.FREE)).resolves.toBeUndefined();
    });

    it('wraps repository read failure as UpstreamError', async () => {
      mockRepo.findByUser.mockRejectedValue(new Error('DB read failed'));
      await expect(service.checkTokenLimit(userId, PlanType.FREE)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
        message: 'DailyUsageService.checkTokenLimit failed',
      });
    });
  });

  // ─── addTokens ──────────────────────────────────────────────────────────────

  describe('addTokens', () => {
    it('calls repo.addTokens with userId, tokenCount, and today UTC midnight', async () => {
      mockRepo.addTokens.mockResolvedValue(makeUsage({ chatTokens: 1000n }));
      await service.addTokens(userId, 1000n, PlanType.FREE);
      expect(mockRepo.addTokens).toHaveBeenCalledWith(userId, 1000n, todayUtcMidnight);
    });

    it('skips DB write when tokenCount is zero', async () => {
      await service.addTokens(userId, 0n, PlanType.FREE);
      expect(mockRepo.addTokens).not.toHaveBeenCalled();
    });

    it('skips DB write for ENTERPRISE plan (unlimited)', async () => {
      await service.addTokens(userId, 5000n, PlanType.ENTERPRISE);
      expect(mockRepo.addTokens).not.toHaveBeenCalled();
    });

    it('wraps repository write failure as UpstreamError', async () => {
      mockRepo.addTokens.mockRejectedValue(new Error('DB write failed'));
      await expect(service.addTokens(userId, 100n, PlanType.FREE)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
        message: 'DailyUsageService.addTokens failed',
      });
    });
  });

  // ─── getRemainingTokens ─────────────────────────────────────────────────────

  describe('getRemainingTokens', () => {
    it('returns full FREE limit when no usage exists', async () => {
      mockRepo.findByUser.mockResolvedValue(null);
      await expect(service.getRemainingTokens(userId, PlanType.FREE)).resolves.toBe(50_000n);
    });

    it('subtracts used tokens from the plan limit', async () => {
      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 10_000n }));
      await expect(service.getRemainingTokens(userId, PlanType.FREE)).resolves.toBe(40_000n);
    });

    it('returns 0n when tokens exactly meet the limit', async () => {
      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 50_000n }));
      await expect(service.getRemainingTokens(userId, PlanType.FREE)).resolves.toBe(0n);
    });

    it('never returns negative — clamps to 0n when over limit', async () => {
      mockRepo.findByUser.mockResolvedValue(makeUsage({ chatTokens: 999_999n }));
      await expect(service.getRemainingTokens(userId, PlanType.FREE)).resolves.toBe(0n);
    });

    it('treats stale usage (yesterday) as zero used tokens', async () => {
      mockRepo.findByUser.mockResolvedValue(
        makeUsage({ chatTokens: 50_000n, lastResetDate: yesterdayUtcMidnight })
      );
      await expect(service.getRemainingTokens(userId, PlanType.FREE)).resolves.toBe(50_000n);
    });

    it('returns null for ENTERPRISE plan (unlimited)', async () => {
      await expect(service.getRemainingTokens(userId, PlanType.ENTERPRISE)).resolves.toBeNull();
      expect(mockRepo.findByUser).not.toHaveBeenCalled();
    });

    it('wraps repository failure as UpstreamError', async () => {
      mockRepo.findByUser.mockRejectedValue(new Error('DB read failed'));
      await expect(service.getRemainingTokens(userId, PlanType.FREE)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
        message: 'DailyUsageService.getRemainingTokens failed',
      });
    });
  });

  // ─── getTodayUsage ──────────────────────────────────────────────────────────

  describe('getTodayUsage', () => {
    it('returns null when no usage exists', async () => {
      mockRepo.findByUser.mockResolvedValue(null);
      await expect(service.getTodayUsage(userId)).resolves.toBeNull();
    });

    it('returns null when latest usage is from a previous day', async () => {
      mockRepo.findByUser.mockResolvedValue(
        makeUsage({ chatTokens: 5000n, lastResetDate: yesterdayUtcMidnight })
      );
      await expect(service.getTodayUsage(userId)).resolves.toBeNull();
    });

    it('returns the usage record when it is from today', async () => {
      const usage = makeUsage({ chatTokens: 2000n });
      mockRepo.findByUser.mockResolvedValue(usage);
      await expect(service.getTodayUsage(userId)).resolves.toBe(usage);
    });

    it('wraps repository failure as UpstreamError', async () => {
      mockRepo.findByUser.mockRejectedValue(new Error('DB read failed'));
      await expect(service.getTodayUsage(userId)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
        message: 'DailyUsageService.getTodayUsage failed',
      });
    });
  });
});
