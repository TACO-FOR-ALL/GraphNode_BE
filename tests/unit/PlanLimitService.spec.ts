import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import { PlanLimitService } from '../../src/core/services/PlanLimitService';
import type {
  IMacroSpaceCounter,
  IMicroSpaceCounter,
  IDailyUsageLimiter,
} from '../../src/core/services/PlanLimitService';
import type { ICreditService, CreditBalanceDto } from '../../src/core/ports/ICreditService';
import { PlanType } from '../../src/core/types/persistence/credit.persistence';
import { DailyUsage } from '../../src/core/types/persistence/usage.persistence';
import { PlanLimitExceededError, UpstreamError } from '../../src/shared/errors/domain';

function makeDailyUsage(chatTokens: bigint): DailyUsage {
  return new DailyUsage({
    id: 'usage-1',
    userId: 'user-1',
    chatTokens,
    lastResetDate: new Date(),
  });
}

function makeBalance(planType: PlanType): CreditBalanceDto {
  const now = new Date();
  return {
    userId: 'user-1',
    balance: 1000,
    holdAmount: 0,
    availableBalance: 1000,
    planType,
    cycleStart: now,
    cycleEnd: now,
  };
}

describe('PlanLimitService', () => {
  let service: PlanLimitService;
  let mockCreditService: jest.Mocked<ICreditService>;
  let mockMacroCounter: jest.Mocked<IMacroSpaceCounter>;
  let mockMicroCounter: jest.Mocked<IMicroSpaceCounter>;
  let mockDailyLimiter: jest.Mocked<IDailyUsageLimiter>;

  const userId = 'user-1';

  beforeEach(() => {
    mockCreditService = {
      deduct: jest.fn(),
      hold: jest.fn(),
      commitByTaskId: jest.fn(),
      rollbackByTaskId: jest.fn(),
      refund: jest.fn(),
      refill: jest.fn(),
      refillAllActiveSubscribers: jest.fn(),
      getBalance: jest.fn(),
      expireStaleHolds: jest.fn(),
      getUsageLogs: jest.fn(),
    } as jest.Mocked<ICreditService>;

    mockMacroCounter = {
      countByUserId: jest.fn(),
    } as jest.Mocked<IMacroSpaceCounter>;

    mockMicroCounter = {
      countByUserId: jest.fn(),
      getTotalFileSizeByUserId: jest.fn(),
    } as jest.Mocked<IMicroSpaceCounter>;

    mockDailyLimiter = {
      checkTokenLimit: jest.fn(),
      addTokens: jest.fn(),
      getTodayUsage: jest.fn(),
    } as jest.Mocked<IDailyUsageLimiter>;

    service = new PlanLimitService(
      mockCreditService,
      mockMacroCounter,
      mockMicroCounter,
      mockDailyLimiter
    );
  });

  // ─── checkChatTokenLimit ────────────────────────────────────────────────────

  describe('checkChatTokenLimit', () => {
    it('delegates to IDailyUsageLimiter.checkTokenLimit with resolved planType', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockDailyLimiter.checkTokenLimit.mockResolvedValue(undefined);

      await service.checkChatTokenLimit(userId);

      expect(mockCreditService.getBalance).toHaveBeenCalledWith(userId);
      expect(mockDailyLimiter.checkTokenLimit).toHaveBeenCalledWith(userId, PlanType.FREE);
    });

    it('propagates PlanLimitExceededError from DailyUsageLimiter directly', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockDailyLimiter.checkTokenLimit.mockRejectedValue(
        new PlanLimitExceededError('일일 토큰 한도 초과')
      );

      await expect(service.checkChatTokenLimit(userId)).rejects.toThrow(PlanLimitExceededError);
    });

    it('wraps unknown errors as UpstreamError', async () => {
      mockCreditService.getBalance.mockRejectedValue(new Error('DB timeout'));

      await expect(service.checkChatTokenLimit(userId)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
      });
    });
  });

  // ─── recordChatTokens ───────────────────────────────────────────────────────

  describe('recordChatTokens', () => {
    it('calls IDailyUsageLimiter.addTokens with resolved planType and tokenCount', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.BASIC));
      mockDailyLimiter.addTokens.mockResolvedValue(undefined);

      await service.recordChatTokens(userId, 5000n);

      expect(mockDailyLimiter.addTokens).toHaveBeenCalledWith(userId, 5000n, PlanType.BASIC);
    });

    it('wraps failures as UpstreamError', async () => {
      mockCreditService.getBalance.mockRejectedValue(new Error('network error'));

      await expect(service.recordChatTokens(userId, 1000n)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
      });
    });
  });

  // ─── checkMacroSpaceLimit ───────────────────────────────────────────────────

  describe('checkMacroSpaceLimit', () => {
    it('passes when current count is below the FREE plan limit (1)', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockMacroCounter.countByUserId.mockResolvedValue(0);

      await expect(service.checkMacroSpaceLimit(userId)).resolves.toBeUndefined();
    });

    it('throws PlanLimitExceededError when count reaches the FREE plan limit', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockMacroCounter.countByUserId.mockResolvedValue(1); // FREE limit = 1

      await expect(service.checkMacroSpaceLimit(userId)).rejects.toThrow(PlanLimitExceededError);
    });

    it('BASIC plan allows up to 10 macro spaces', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.BASIC));
      mockMacroCounter.countByUserId.mockResolvedValue(9);
      await expect(service.checkMacroSpaceLimit(userId)).resolves.toBeUndefined();

      mockMacroCounter.countByUserId.mockResolvedValue(10);
      await expect(service.checkMacroSpaceLimit(userId)).rejects.toThrow(PlanLimitExceededError);
    });

    it('PLUS plan allows up to 20 macro spaces', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.PLUS));
      mockMacroCounter.countByUserId.mockResolvedValue(19);
      await expect(service.checkMacroSpaceLimit(userId)).resolves.toBeUndefined();

      mockMacroCounter.countByUserId.mockResolvedValue(20);
      await expect(service.checkMacroSpaceLimit(userId)).rejects.toThrow(PlanLimitExceededError);
    });

    it('ENTERPRISE plan skips the count check entirely', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.ENTERPRISE));

      await expect(service.checkMacroSpaceLimit(userId)).resolves.toBeUndefined();
      expect(mockMacroCounter.countByUserId).not.toHaveBeenCalled();
    });

    it('wraps unknown errors as UpstreamError', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockMacroCounter.countByUserId.mockRejectedValue(new Error('Neo4j timeout'));

      await expect(service.checkMacroSpaceLimit(userId)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
      });
    });
  });

  // ─── checkMicroSpaceLimit ───────────────────────────────────────────────────

  describe('checkMicroSpaceLimit', () => {
    it('passes when current count is below the FREE plan limit (5)', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockMicroCounter.countByUserId.mockResolvedValue(4);
      await expect(service.checkMicroSpaceLimit(userId)).resolves.toBeUndefined();
    });

    it('throws PlanLimitExceededError when count reaches the FREE plan limit', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockMicroCounter.countByUserId.mockResolvedValue(5); // FREE limit = 5

      await expect(service.checkMicroSpaceLimit(userId)).rejects.toThrow(PlanLimitExceededError);
    });

    it('BASIC plan allows up to 50 micro spaces', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.BASIC));
      mockMicroCounter.countByUserId.mockResolvedValue(50);
      await expect(service.checkMicroSpaceLimit(userId)).rejects.toThrow(PlanLimitExceededError);
    });

    it('PLUS plan allows up to 100 micro spaces', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.PLUS));
      mockMicroCounter.countByUserId.mockResolvedValue(99);
      await expect(service.checkMicroSpaceLimit(userId)).resolves.toBeUndefined();

      mockMicroCounter.countByUserId.mockResolvedValue(100);
      await expect(service.checkMicroSpaceLimit(userId)).rejects.toThrow(PlanLimitExceededError);
    });

    it('ENTERPRISE plan skips the count check entirely', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.ENTERPRISE));
      await expect(service.checkMicroSpaceLimit(userId)).resolves.toBeUndefined();
      expect(mockMicroCounter.countByUserId).not.toHaveBeenCalled();
    });

    it('wraps unknown errors as UpstreamError', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockMicroCounter.countByUserId.mockRejectedValue(new Error('MongoDB timeout'));

      await expect(service.checkMicroSpaceLimit(userId)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
      });
    });
  });

  // ─── checkFileStorageLimit ──────────────────────────────────────────────────

  describe('checkFileStorageLimit', () => {
    const GB = 1024 * 1024 * 1024;

    it('passes when used + incoming bytes are below the FREE plan limit (1 GB)', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(GB - 1);
      await expect(service.checkFileStorageLimit(userId, 0)).resolves.toBeUndefined();
    });

    it('throws PlanLimitExceededError when used + incoming exceeds the FREE limit', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(GB - 100);
      await expect(service.checkFileStorageLimit(userId, 101)).rejects.toThrow(PlanLimitExceededError);
    });

    it('BASIC plan allows up to 10 GB storage', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.BASIC));
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(10 * GB - 1);
      await expect(service.checkFileStorageLimit(userId, 0)).resolves.toBeUndefined();

      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(10 * GB);
      await expect(service.checkFileStorageLimit(userId, 1)).rejects.toThrow(PlanLimitExceededError);
    });

    it('ENTERPRISE plan skips storage check entirely', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.ENTERPRISE));
      await expect(service.checkFileStorageLimit(userId, 999 * GB)).resolves.toBeUndefined();
      expect(mockMicroCounter.getTotalFileSizeByUserId).not.toHaveBeenCalled();
    });

    it('wraps unknown errors as UpstreamError', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockMicroCounter.getTotalFileSizeByUserId.mockRejectedValue(new Error('aggregation failed'));

      await expect(service.checkFileStorageLimit(userId, 1024)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
      });
    });
  });

  // ─── getPlanUsage ───────────────────────────────────────────────────────────

  describe('getPlanUsage', () => {
    const GB = 1024 * 1024 * 1024;

    it('returns accurate usage snapshot for FREE plan', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockDailyLimiter.getTodayUsage.mockResolvedValue(makeDailyUsage(30_000n));
      mockMacroCounter.countByUserId.mockResolvedValue(1);
      mockMicroCounter.countByUserId.mockResolvedValue(3);
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(512 * 1024 * 1024);

      const result = await service.getPlanUsage(userId);

      expect(result.planType).toBe(PlanType.FREE);
      expect(result.chatTokens).toEqual({ used: 30_000, limit: 50_000 });
      expect(result.macroSpace).toEqual({ used: 1, limit: 1 });
      expect(result.microSpace).toEqual({ used: 3, limit: 5 });
      expect(result.fileStorage).toEqual({ usedBytes: 512 * 1024 * 1024, limitBytes: GB });
    });

    it('returns accurate usage snapshot for BASIC plan', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.BASIC));
      mockDailyLimiter.getTodayUsage.mockResolvedValue(makeDailyUsage(100_000n));
      mockMacroCounter.countByUserId.mockResolvedValue(5);
      mockMicroCounter.countByUserId.mockResolvedValue(20);
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(2 * GB);

      const result = await service.getPlanUsage(userId);

      expect(result.planType).toBe(PlanType.BASIC);
      expect(result.chatTokens).toEqual({ used: 100_000, limit: 250_000 });
      expect(result.macroSpace).toEqual({ used: 5, limit: 10 });
      expect(result.microSpace).toEqual({ used: 20, limit: 50 });
      expect(result.fileStorage).toEqual({ usedBytes: 2 * GB, limitBytes: 10 * GB });
    });

    it('returns accurate usage snapshot for PLUS plan', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.PLUS));
      mockDailyLimiter.getTodayUsage.mockResolvedValue(makeDailyUsage(499_999n));
      mockMacroCounter.countByUserId.mockResolvedValue(18);
      mockMicroCounter.countByUserId.mockResolvedValue(99);
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(15 * GB);

      const result = await service.getPlanUsage(userId);

      expect(result.planType).toBe(PlanType.PLUS);
      expect(result.chatTokens).toEqual({ used: 499_999, limit: 500_000 });
      expect(result.macroSpace).toEqual({ used: 18, limit: 20 });
      expect(result.microSpace).toEqual({ used: 99, limit: 100 });
      expect(result.fileStorage).toEqual({ usedBytes: 15 * GB, limitBytes: 20 * GB });
    });

    it('returns null for all limits on ENTERPRISE plan (unlimited)', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.ENTERPRISE));
      mockDailyLimiter.getTodayUsage.mockResolvedValue(makeDailyUsage(2_000_000n));
      mockMacroCounter.countByUserId.mockResolvedValue(500);
      mockMicroCounter.countByUserId.mockResolvedValue(1000);
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(100 * GB);

      const result = await service.getPlanUsage(userId);

      expect(result.planType).toBe(PlanType.ENTERPRISE);
      expect(result.chatTokens.limit).toBeNull();
      expect(result.macroSpace.limit).toBeNull();
      expect(result.microSpace.limit).toBeNull();
      expect(result.fileStorage.limitBytes).toBeNull();
      // used values still returned correctly
      expect(result.chatTokens.used).toBe(2_000_000);
      expect(result.macroSpace.used).toBe(500);
    });

    it('returns chatTokens.used = 0 when no DailyUsage record exists today (null)', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockDailyLimiter.getTodayUsage.mockResolvedValue(null);
      mockMacroCounter.countByUserId.mockResolvedValue(0);
      mockMicroCounter.countByUserId.mockResolvedValue(0);
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(0);

      const result = await service.getPlanUsage(userId);

      expect(result.chatTokens.used).toBe(0);
    });

    it('fetches all four data sources in parallel (all mocks called once)', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockDailyLimiter.getTodayUsage.mockResolvedValue(null);
      mockMacroCounter.countByUserId.mockResolvedValue(0);
      mockMicroCounter.countByUserId.mockResolvedValue(0);
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(0);

      await service.getPlanUsage(userId);

      expect(mockDailyLimiter.getTodayUsage).toHaveBeenCalledTimes(1);
      expect(mockMacroCounter.countByUserId).toHaveBeenCalledTimes(1);
      expect(mockMicroCounter.countByUserId).toHaveBeenCalledTimes(1);
      expect(mockMicroCounter.getTotalFileSizeByUserId).toHaveBeenCalledTimes(1);
    });

    it('throws UpstreamError when getBalance fails', async () => {
      mockCreditService.getBalance.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.getPlanUsage(userId)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
      });
    });

    it('throws UpstreamError when getTodayUsage fails', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.FREE));
      mockDailyLimiter.getTodayUsage.mockRejectedValue(new Error('Redis timeout'));
      mockMacroCounter.countByUserId.mockResolvedValue(0);
      mockMicroCounter.countByUserId.mockResolvedValue(0);
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(0);

      await expect(service.getPlanUsage(userId)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
      });
    });

    it('throws UpstreamError when macroGraphStore.countByUserId fails', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.BASIC));
      mockDailyLimiter.getTodayUsage.mockResolvedValue(null);
      mockMacroCounter.countByUserId.mockRejectedValue(new Error('Neo4j unreachable'));
      mockMicroCounter.countByUserId.mockResolvedValue(0);
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(0);

      await expect(service.getPlanUsage(userId)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
      });
    });

    it('safely converts bigint chatTokens to number (boundary: MAX_SAFE_INTEGER safe range)', async () => {
      mockCreditService.getBalance.mockResolvedValue(makeBalance(PlanType.PLUS));
      mockDailyLimiter.getTodayUsage.mockResolvedValue(makeDailyUsage(500_000n));
      mockMacroCounter.countByUserId.mockResolvedValue(0);
      mockMicroCounter.countByUserId.mockResolvedValue(0);
      mockMicroCounter.getTotalFileSizeByUserId.mockResolvedValue(0);

      const result = await service.getPlanUsage(userId);

      expect(typeof result.chatTokens.used).toBe('number');
      expect(result.chatTokens.used).toBe(500_000);
    });
  });
});
