/**
 * @module PaymentHistoryRepository
 * @description Prisma(PostgreSQL) 기반 IPaymentHistoryRepository 구현체.
 */

import prisma from '../db/prisma';
import type { IPaymentHistoryRepository } from '../../core/ports/IPaymentHistoryRepository';
import type {
  PaymentHistoryRow,
  CreatePaymentHistoryDto,
} from '../../core/types/persistence/subscription.persistence';

/**
 * `payment_histories` 테이블에 접근하는 Prisma 기반 저장소 구현체.
 *
 * @implements {IPaymentHistoryRepository}
 */
export class PaymentHistoryRepository implements IPaymentHistoryRepository {
  /**
   * 결제 내역 row를 생성합니다 (append-only).
   * @param dto 결제 생성 데이터
   * @returns 생성된 결제 내역 row
   */
  async create(dto: CreatePaymentHistoryDto): Promise<PaymentHistoryRow> {
    const row = await prisma.paymentHistory.create({
      data: {
        userId:                dto.userId,
        subscriptionId:        dto.subscriptionId,
        amount:                dto.amount,
        currency:              dto.currency,
        status:                dto.status,
        pgProvider:            dto.pgProvider,
        idempotencyKey:        dto.idempotencyKey,
        externalTransactionId: dto.externalTransactionId ?? null,
        pgReceiptData:         (dto.pgReceiptData as any) ?? null,
      },
    });
    return row as unknown as PaymentHistoryRow;
  }

  /**
   * idempotencyKey로 결제 내역을 조회합니다.
   * @param key 멱등성 키
   * @returns 결제 내역 row 또는 null
   */
  async findByIdempotencyKey(key: string): Promise<PaymentHistoryRow | null> {
    const row = await prisma.paymentHistory.findUnique({
      where: { idempotencyKey: key },
    });
    return row as unknown as PaymentHistoryRow | null;
  }

  /**
   * 사용자의 결제 내역을 최신순으로 조회합니다.
   * @param userId 사용자 ID
   * @param limit  최대 조회 건수 (기본 20)
   * @returns 결제 내역 배열
   */
  async findByUserId(userId: string, limit = 20): Promise<PaymentHistoryRow[]> {
    const rows = await prisma.paymentHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows as unknown as PaymentHistoryRow[];
  }
}
