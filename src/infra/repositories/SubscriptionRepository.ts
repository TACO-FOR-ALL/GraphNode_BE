/**
 * @module SubscriptionRepository
 * @description Prisma(PostgreSQL) 기반 ISubscriptionRepository 구현체.
 */

import prisma from '../db/prisma';
import type { ISubscriptionRepository } from '../../core/ports/ISubscriptionRepository';
import type {
  SubscriptionRow,
  CreateSubscriptionDto,
  UpdateSubscriptionStatusDto,
} from '../../core/types/persistence/subscription.persistence';
import { NotFoundError } from '../../shared/errors/domain';

/**
 * `subscriptions` 테이블에 접근하는 Prisma 기반 저장소 구현체.
 *
 * @implements {ISubscriptionRepository}
 */
export class SubscriptionRepository implements ISubscriptionRepository {
  /**
   * 사용자의 현재 활성(ACTIVE) 구독을 조회합니다.
   * @param userId 사용자 ID
   * @returns 활성 구독 row 또는 null
   */
  async findActiveByUserId(userId: string): Promise<SubscriptionRow | null> {
    const row = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    return row as SubscriptionRow | null;
  }

  /**
   * 새 구독 row를 생성합니다.
   * @param dto 구독 생성 데이터
   * @returns 생성된 구독 row
   */
  async create(dto: CreateSubscriptionDto): Promise<SubscriptionRow> {
    const row = await prisma.subscription.create({
      data: {
        userId:                 dto.userId,
        planType:               dto.planType,
        status:                 dto.status,
        source:                 dto.source,
        billingCycle:           dto.billingCycle ?? null,
        currentPeriodStart:     dto.currentPeriodStart,
        currentPeriodEnd:       dto.currentPeriodEnd,
        grantedUntil:           dto.grantedUntil ?? null,
        externalSubscriptionId: dto.externalSubscriptionId ?? null,
        paymentMethodId:        dto.paymentMethodId ?? null,
      },
    });
    return row as SubscriptionRow;
  }

  /**
   * 구독의 status와 관련 시간 필드를 업데이트합니다.
   * @param dto 업데이트 데이터
   * @returns 업데이트된 구독 row
   * @throws {NotFoundError} 해당 ID의 구독이 없을 때
   */
  async updateStatus(dto: UpdateSubscriptionStatusDto): Promise<SubscriptionRow> {
    const existing = await prisma.subscription.findUnique({ where: { id: dto.id } });
    if (!existing) throw new NotFoundError(`Subscription not found: ${dto.id}`);

    const row = await prisma.subscription.update({
      where: { id: dto.id },
      data: {
        status:                 dto.status,
        canceledAt:             dto.canceledAt ?? undefined,
        currentPeriodEnd:       dto.currentPeriodEnd ?? undefined,
        externalSubscriptionId: dto.externalSubscriptionId ?? undefined,
        paymentMethodId:        dto.paymentMethodId ?? undefined,
      },
    });
    return row as SubscriptionRow;
  }

  /**
   * ID로 구독 단건을 조회합니다.
   * @param id 구독 ID
   * @returns 구독 row 또는 null
   */
  async findById(id: string): Promise<SubscriptionRow | null> {
    const row = await prisma.subscription.findUnique({ where: { id } });
    return row as SubscriptionRow | null;
  }

  /**
   * 사용자의 모든 구독을 최신순으로 조회합니다.
   * @param userId 사용자 ID
   * @returns 구독 row 배열
   */
  async findByUserId(userId: string): Promise<SubscriptionRow[]> {
    const rows = await prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows as SubscriptionRow[];
  }

  /**
   * 사용자의 PENDING 상태 구독을 조회합니다.
   * @param userId 사용자 ID
   * @returns PENDING 구독 row 또는 null
   */
  async findPendingByUserId(userId: string): Promise<SubscriptionRow | null> {
    const row = await prisma.subscription.findFirst({
      where: { userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    return row as SubscriptionRow | null;
  }
}
