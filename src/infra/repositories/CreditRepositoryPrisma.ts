/**
 * 모듈: CreditRepositoryPrisma (크레딧 Prisma 구현체)
 *
 * 책임:
 * - ICreditRepository 포트의 PostgreSQL/Prisma 구현체입니다.
 * - deductBalance / holdBalance 는 Serializable 트랜잭션으로 race condition 을 방지합니다.
 * - commitHold / rollbackHold 는 taskId 를 기반으로 HOLD 트랜잭션을 찾아 처리합니다.
 *
 * 외부 의존:
 * - PrismaClient (PostgreSQL)
 */

import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';

import {
  ICreditRepository,
  CreditBalanceRow,
  CreditTransactionRow,
} from '../../core/ports/ICreditRepository';
import prisma from '../db/prisma';
import {
  CreditFeature,
  CreditTransactionType,
  PlanType,
} from '../../core/types/persistence/credit.persistence';

export class CreditRepositoryPrisma implements ICreditRepository {
  /**
   * 사용자 ID로 크레딧 잔액 조회
   * @param userId 사용자 ID
   * @returns 크레딧 잔액 정보
   */
  async findBalanceByUserId(userId: string): Promise<CreditBalanceRow | null> {
    const row = await prisma.creditBalance.findUnique({ where: { userId } });
    return row ? this.mapBalance(row) : null;
  }

  /**
   * 새로운 사용자의 크레딧 잔액 생성
   * @param params 사용자 ID, 기본 크레딧, 요금제, 구독 주기 시작/종료일
   * @returns 생성된 크레딧 잔액 정보
   */
  async createBalance(params: {
    userId: string;
    balance: number;
    planType: PlanType;
    cycleStart: Date;
    cycleEnd: Date;
  }): Promise<CreditBalanceRow> {
    // 유저id, 크레딧 양, 요금제, 구독 주기 시작일, 종료일
    const row = await prisma.creditBalance.create({
      data: {
        id: uuidv4(),
        userId: params.userId,
        balance: params.balance,
        holdAmount: 0,
        planType: params.planType,
        cycleStart: params.cycleStart,
        cycleEnd: params.cycleEnd,
      },
    });
    return this.mapBalance(row);
  }

  /**
   * 원자적 잔액 차감
   * Serializable 트랜잭션으로 동시성 충돌을 방지합니다.
   * @param params 사용자 ID, 차감할 크레딧 양, 크레딧 사용 기능, 설명
   * @returns 잔액 차감 성공 여부 및 차감 후 잔액
   */
  async deductBalance(params: {
    userId: string;
    cost: number;
    feature: CreditFeature;
    description?: string;
  }): Promise<{ success: boolean; availableAfter: number }> {
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
        SELECT user_id
        FROM credit_balances
        WHERE user_id = ${params.userId}
        FOR UPDATE
      `;

        // 유저id로 크레딧 잔액 조회
        const balance = await tx.creditBalance.findUnique({ where: { userId: params.userId } });
        if (!balance) return { success: false, availableAfter: 0 };

        // 잔액과 홀드 금액을 뺀 실제 가용 금액 계산
        const available = balance.balance - balance.holdAmount;
        if (available < params.cost) {
          return { success: false, availableAfter: available };
        }

        // 잔액 차감
        const newBalance = balance.balance - params.cost;
        await tx.creditBalance.update({
          where: { userId: params.userId },
          data: { balance: { decrement: params.cost } },
        });

        // 크레딧 사용 로그 기록
        await tx.creditTransaction.create({
          data: {
            id: uuidv4(),
            userId: params.userId,
            type: CreditTransactionType.DEDUCT,
            feature: params.feature,
            amount: params.cost,
            description: params.description ?? null,
          },
        });

        return { success: true, availableAfter: newBalance - balance.holdAmount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  /**
   * 원자적 hold 설정.
   * holdAmount += cost, HOLD 트랜잭션 기록.
   * @param params 사용자 ID, 차감할 크레딧 양, 기능, 태스크 ID, 만료 시간
   * @returns 성공 여부 및 홀드 후 잔액
   */
  async holdBalance(params: {
    userId: string;
    cost: number;
    feature: CreditFeature;
    taskId: string;
    expiresAt: Date;
  }): Promise<{ success: boolean; availableAfter: number }> {
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
        SELECT user_id
        FROM credit_balances
        WHERE user_id = ${params.userId}
        FOR UPDATE
      `;
        const balance = await tx.creditBalance.findUnique({ where: { userId: params.userId } });
        if (!balance) return { success: false, availableAfter: 0 };

        // 잔액과 홀드 금액을 뺀 실제 가용 금액 계산
        const available = balance.balance - balance.holdAmount;
        // 크레딧이 부족한 경우 오류 발생
        if (available < params.cost) {
          return { success: false, availableAfter: available };
        }

        // 홀드 금액 증가
        await tx.creditBalance.update({
          where: { userId: params.userId },
          data: { holdAmount: { increment: params.cost } },
        });

        // HOLD 트랜잭션 기록
        await tx.creditTransaction.create({
          data: {
            id: uuidv4(),
            userId: params.userId,
            type: CreditTransactionType.HOLD,
            feature: params.feature,
            amount: params.cost,
            taskId: params.taskId,
            expiresAt: params.expiresAt,
          },
        });

        return { success: true, availableAfter: available - params.cost };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  /**
   * HOLD → COMMIT: balance -= cost, holdAmount -= cost.
   * taskId로 HOLD 트랜잭션을 찾아 balance에서 최종 차감
   * @param taskId SQS envelope taskId
   * @returns 성공 여부
   */
  async commitHold(taskId: string): Promise<boolean> {
    // HOLD 트랜잭션 조회
    const holdTx = await prisma.creditTransaction.findFirst({
      where: { taskId, type: CreditTransactionType.HOLD },
    });
    if (!holdTx) return false;

    // 이미 COMMIT/ROLLBACK 된 경우 중복 처리 방지
    const alreadySettled = await prisma.creditTransaction.findFirst({
      where: {
        taskId,
        type: { in: [CreditTransactionType.COMMIT, CreditTransactionType.ROLLBACK] },
      },
    });
    if (alreadySettled) return false;

    // Serializable 트랜잭션으로 동시성 충돌 방지
    const committed = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${taskId}))
      `;

        await tx.$queryRaw`
        SELECT id
        FROM credit_transactions
        WHERE task_id = ${taskId}
        FOR UPDATE
      `;

        // 트랜잭션 내에서 이미 처리된 경우 중복 방지
        const alreadySettledInTx = await tx.creditTransaction.findFirst({
          where: {
            taskId,
            type: { in: [CreditTransactionType.COMMIT, CreditTransactionType.ROLLBACK] },
          },
        });
        if (alreadySettledInTx) return false;

        // 잔액 조회
        await tx.$queryRaw`
        SELECT user_id
        FROM credit_balances
        WHERE user_id = ${holdTx.userId}
        FOR UPDATE
      `;

        // 잔액과 홀드 금액 차감
        await tx.creditBalance.update({
          where: { userId: holdTx.userId },
          data: {
            balance: { decrement: holdTx.amount },
            holdAmount: { decrement: holdTx.amount },
          },
        });

        // COMMIT 트랜잭션 기록
        await tx.creditTransaction.create({
          data: {
            id: uuidv4(),
            userId: holdTx.userId,
            type: CreditTransactionType.COMMIT,
            feature: holdTx.feature,
            amount: holdTx.amount,
            taskId,
            description: `Committed hold for taskId: ${taskId}`,
          },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return committed;
  }

  /**
   * HOLD → ROLLBACK: holdAmount -= cost, balance 변경 없음.
   * @param taskId SQS envelope taskId
   * @returns 성공 여부
   */
  async rollbackHold(taskId: string): Promise<boolean> {
    // HOLD 트랜잭션 조회
    const holdTx = await prisma.creditTransaction.findFirst({
      where: { taskId, type: CreditTransactionType.HOLD },
    });
    if (!holdTx) return false;

    // 이미 처리된 경우 중복 방지
    const alreadySettled = await prisma.creditTransaction.findFirst({
      where: {
        taskId,
        type: { in: [CreditTransactionType.COMMIT, CreditTransactionType.ROLLBACK] },
      },
    });
    if (alreadySettled) return false;

    const rolledBack = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${taskId}))
      `;

        await tx.$queryRaw`
        SELECT id
        FROM credit_transactions
        WHERE task_id = ${taskId}
        FOR UPDATE
      `;

        // 트랜잭션 내에서 이미 처리된 경우 중복 방지
        const alreadySettledInTx = await tx.creditTransaction.findFirst({
          where: {
            taskId,
            type: { in: [CreditTransactionType.COMMIT, CreditTransactionType.ROLLBACK] },
          },
        });
        if (alreadySettledInTx) return false;

        await tx.$queryRaw`
        SELECT user_id
        FROM credit_balances
        WHERE user_id = ${holdTx.userId}
        FOR UPDATE
      `;

        // 홀드 금액 차감
        await tx.creditBalance.update({
          where: { userId: holdTx.userId },
          data: { holdAmount: { decrement: holdTx.amount } },
        });

        // ROLLBACK 트랜잭션 기록
        await tx.creditTransaction.create({
          data: {
            id: uuidv4(),
            userId: holdTx.userId,
            type: CreditTransactionType.ROLLBACK,
            feature: holdTx.feature,
            amount: holdTx.amount,
            taskId,
            description: `Rolled back hold for taskId: ${taskId}`,
          },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return rolledBack;
  }

  /**
   * 잔액 환불
   * @param params 환불할 잔액 정보, 홀드된 금액이 아닌 실제 잔액
   */
  async refundBalance(params: {
    userId: string;
    amount: number;
    description: string;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.creditBalance.update({
        where: { userId: params.userId },
        data: { balance: { increment: params.amount } },
      });

      // 환불 트랜잭션 기록
      await tx.creditTransaction.create({
        data: {
          id: uuidv4(),
          userId: params.userId,
          type: CreditTransactionType.REFUND,
          amount: params.amount,
          description: params.description,
        },
      });
    });
  }

  /**
   * 정기 크레딧 갱신 (월초 실행, 매월 1일 00:00)
   * - 홀드 금액 초기화, 잔액 초기화
   *
   * @param params 구독 플랜 정보
   */
  async refillBalance(params: {
    userId: string;
    planLimit: number;
    planType: PlanType;
    cycleStart: Date;
    cycleEnd: Date;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.creditBalance.findUnique({ where: { userId: params.userId } });
      const prevBalance = existing?.balance ?? 0;

      // 플랜이 동일하면 carry-over, 다르면 reset (DB 스키마에 따라 로직 추가 가능)
      await tx.creditBalance.update({
        where: { userId: params.userId },
        data: {
          balance: params.planLimit,
          holdAmount: 0, // 갱신 시 stale hold 모두 해제
          planType: params.planType,
          cycleStart: params.cycleStart,
          cycleEnd: params.cycleEnd,
        },
      });

      // 리필 트랜잭션 기록
      await tx.creditTransaction.create({
        data: {
          id: uuidv4(),
          userId: params.userId,
          type: CreditTransactionType.REFILL,
          amount: params.planLimit - prevBalance,
          description: `Monthly refill — ${params.planType}`,
        },
      });
    });
  }

  /**
   * 구독 종료된 사용자 조회
   * @param now 현재 시간
   * @returns 구독 종료된 사용자 목록
   */
  async findUsersWithExpiredCycle(
    now: Date
  ): Promise<Array<{ userId: string; planType: PlanType }>> {
    const rows = await prisma.creditBalance.findMany({
      where: { cycleEnd: { lte: now } },
      select: { userId: true, planType: true },
    });
    return rows;
  }

  /**
   * 만료된 홀드 조회
   * @param now 현재 시간
   * @returns 만료된 홀드 목록
   */
  async findExpiredHolds(now: Date): Promise<CreditTransactionRow[]> {
    const rows = await prisma.creditTransaction.findMany({
      where: {
        type: CreditTransactionType.HOLD,
        expiresAt: { lte: now },
      },
    });
    return rows.map(this.mapTransaction);
  }

  /**
   * TaskId로 HOLD 트랜잭션 조회
   * @param taskId TaskId
   * @returns HOLD 트랜잭션
   */
  async findHoldByTaskId(taskId: string): Promise<CreditTransactionRow | null> {
    const row = await prisma.creditTransaction.findFirst({
      where: { taskId, type: CreditTransactionType.HOLD },
    });
    return row ? this.mapTransaction(row) : null;
  }

  /**
   * 크레딧 사용 로그 기록
   * @param params 크레딧 사용 로그 정보
   */
  async createUsageLog(params: {
    userId: string;
    feature: CreditFeature;
    taskId: string | null;
    creditUsed: number;
    status: 'SUCCESS' | 'FAILED';
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.usageLog.create({
      data: {
        id: uuidv4(),
        userId: params.userId,
        feature: params.feature,
        taskId: params.taskId,
        creditUsed: params.creditUsed,
        status: params.status,
        metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  // ── Mappers ──────────────────────────────────────────────────────────────────

  /**
   * 사용 내역(UsageLog) 페이지네이션 조회
   * @param params 조회 조건
   * @returns 사용 내역 목록과 전체 개수
   */
  async findUsageLogs(params: {
    userId: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: Array<{
    id: string;
    feature: CreditFeature;
    creditUsed: number;
    status: 'SUCCESS' | 'FAILED';
    taskId: string | null;
    createdAt: Date;
  }>; total: number }> {
    const limit  = params.limit  ?? 20;
    const offset = params.offset ?? 0;

    const [rows, total] = await Promise.all([
      prisma.usageLog.findMany({
        where:   { userId: params.userId },
        orderBy: { createdAt: 'desc' },
        take:    limit,
        skip:    offset,
        select:  { id: true, feature: true, creditUsed: true, status: true, taskId: true, createdAt: true },
      }),
      prisma.usageLog.count({ where: { userId: params.userId } }),
    ]);

    return {
      items: rows.map((r) => ({
        id:         r.id,
        feature:    r.feature as CreditFeature,
        creditUsed: r.creditUsed,
        status:     r.status as 'SUCCESS' | 'FAILED',
        taskId:     r.taskId,
        createdAt:  r.createdAt,
      })),
      total,
    };
  }

  // ── Private Mappers ──────────────────────────────────────────────────────────


  /**
   * DB 조회 결과를 도메인 객체로 매핑
   * @param row DB 조회 결과
   * @returns 도메인 객체
   */
  private mapBalance(row: {
    id: string;
    userId: string;
    balance: number;
    holdAmount: number;
    planType: PlanType;
    cycleStart: Date;
    cycleEnd: Date;
    updatedAt: Date;
  }): CreditBalanceRow {
    return {
      id: row.id,
      userId: row.userId,
      balance: row.balance,
      holdAmount: row.holdAmount,
      planType: row.planType,
      cycleStart: row.cycleStart,
      cycleEnd: row.cycleEnd,
      updatedAt: row.updatedAt,
    };
  }

  private mapTransaction(row: {
    id: string;
    userId: string;
    type: CreditTransactionType;
    feature: CreditFeature | null;
    amount: number;
    taskId: string | null;
    expiresAt: Date | null;
  }): CreditTransactionRow {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      feature: row.feature,
      amount: row.amount,
      taskId: row.taskId,
      expiresAt: row.expiresAt,
    };
  }
}
