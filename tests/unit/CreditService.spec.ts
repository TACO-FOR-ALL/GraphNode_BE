import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { CreditService } from '../../src/core/services/CreditService';
import type {
  CreditBalanceRow,
  CreditTransactionRow,
  ICreditRepository,
} from '../../src/core/ports/ICreditRepository';
import { InsufficientCreditError } from '../../src/shared/errors/domain';
import {
  CreditFeature,
  CreditTransactionType,
  PlanType,
} from '../../src/core/types/persistence/credit.persistence';

describe('CreditService', () => {
  let repo: jest.Mocked<ICreditRepository>;
  let service: CreditService;

  const now = new Date('2026-05-01T00:00:00.000Z');
  const balance = (overrides: Partial<CreditBalanceRow> = {}): CreditBalanceRow => ({
    id: 'balance-1',
    userId: 'user-1',
    balance: 30,
    holdAmount: 0,
    planType: PlanType.FREE,
    cycleStart: now,
    cycleEnd: new Date('2026-05-31T00:00:00.000Z'),
    updatedAt: now,
    ...overrides,
  });

  const hold = (overrides: Partial<CreditTransactionRow> = {}): CreditTransactionRow => ({
    id: 'hold-1',
    userId: 'user-1',
    type: CreditTransactionType.HOLD,
    feature: CreditFeature.GRAPH_GENERATION,
    amount: 10,
    taskId: 'task_user-1_01HOLD',
    expiresAt: new Date('2026-05-01T02:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    repo = {
      findBalanceByUserId: jest.fn(),
      createBalance: jest.fn(),
      deductBalance: jest.fn(),
      holdBalance: jest.fn(),
      commitHold: jest.fn(),
      rollbackHold: jest.fn(),
      refundBalance: jest.fn(),
      refillBalance: jest.fn(),
      findUsersWithExpiredCycle: jest.fn(),
      findExpiredHolds: jest.fn(),
      findHoldByTaskId: jest.fn(),
      createUsageLog: jest.fn(),
      findUsageLogs: jest.fn(),
    };
    service = new CreditService(repo);
  });

  it('blocks deduction when available balance is below feature cost', async () => {
    repo.findBalanceByUserId.mockResolvedValue(balance({ balance: 5, holdAmount: 0 }));

    await expect(
      service.deduct('user-1', CreditFeature.GRAPH_GENERATION)
    ).rejects.toBeInstanceOf(InsufficientCreditError);

    expect(repo.deductBalance).not.toHaveBeenCalled();
    expect(repo.createUsageLog).not.toHaveBeenCalled();
  });

  it('blocks escrow hold before queueing when available balance is insufficient', async () => {
    repo.findBalanceByUserId.mockResolvedValue(balance({ balance: 8, holdAmount: 4 }));

    await expect(
      service.hold('user-1', CreditFeature.ADD_NODE, 'task_user-1_01LOW')
    ).rejects.toBeInstanceOf(InsufficientCreditError);

    expect(repo.holdBalance).not.toHaveBeenCalled();
  });

  it('places an escrow hold with the SQS taskId when enough credits exist', async () => {
    repo.findBalanceByUserId.mockResolvedValue(balance({ balance: 30, holdAmount: 0 }));
    repo.holdBalance.mockResolvedValue({ success: true, availableAfter: 20 });

    await service.hold('user-1', CreditFeature.GRAPH_GENERATION, 'task_user-1_01OK');

    expect(repo.holdBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        feature: CreditFeature.GRAPH_GENERATION,
        taskId: 'task_user-1_01OK',
        cost: 10,
      })
    );
  });

  it('commits escrow by taskId and records successful usage', async () => {
    repo.commitHold.mockResolvedValue(true);
    repo.findHoldByTaskId.mockResolvedValue(hold());

    await expect(service.commitByTaskId('task_user-1_01HOLD')).resolves.toBeUndefined();

    expect(repo.commitHold).toHaveBeenCalledWith('task_user-1_01HOLD');
    expect(repo.createUsageLog).toHaveBeenCalledWith({
      userId: 'user-1',
      feature: CreditFeature.GRAPH_GENERATION,
      taskId: 'task_user-1_01HOLD',
      creditUsed: 10,
      status: 'SUCCESS',
    });
  });

  it('rolls back escrow by taskId and records failed usage without consuming credits', async () => {
    repo.rollbackHold.mockResolvedValue(true);
    repo.findHoldByTaskId.mockResolvedValue(hold({ feature: CreditFeature.ADD_NODE, amount: 5 }));

    await expect(service.rollbackByTaskId('task_user-1_01HOLD')).resolves.toBeUndefined();

    expect(repo.rollbackHold).toHaveBeenCalledWith('task_user-1_01HOLD');
    expect(repo.createUsageLog).toHaveBeenCalledWith({
      userId: 'user-1',
      feature: CreditFeature.ADD_NODE,
      taskId: 'task_user-1_01HOLD',
      creditUsed: 0,
      status: 'FAILED',
    });
  });

  it('expires stale holds by rolling back every expired taskId', async () => {
    repo.findExpiredHolds.mockResolvedValue([
      hold({ taskId: 'task_user-1_expired_1' }),
      hold({ taskId: 'task_user-1_expired_2', amount: 5, feature: CreditFeature.ADD_NODE }),
    ]);
    repo.rollbackHold.mockResolvedValue(true);

    await service.expireStaleHolds();

    expect(repo.findExpiredHolds).toHaveBeenCalledWith(expect.any(Date));
    expect(repo.rollbackHold).toHaveBeenCalledTimes(2);
    expect(repo.rollbackHold).toHaveBeenCalledWith('task_user-1_expired_1');
    expect(repo.rollbackHold).toHaveBeenCalledWith('task_user-1_expired_2');
  });
});
