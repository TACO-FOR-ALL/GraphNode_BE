/**
 * @module UserPaymentMethodRepository
 * @description Prisma(PostgreSQL) 기반 IUserPaymentMethodRepository 구현체.
 */

import prisma from '../db/prisma';
import type { IUserPaymentMethodRepository } from '../../core/ports/IUserPaymentMethodRepository';
import type {
  UserPaymentMethodRow,
  CreateUserPaymentMethodDto,
} from '../../core/types/persistence/subscription.persistence';

/**
 * `user_payment_methods` 테이블에 접근하는 Prisma 기반 저장소 구현체.
 *
 * @implements {IUserPaymentMethodRepository}
 */
export class UserPaymentMethodRepository implements IUserPaymentMethodRepository {
  /**
   * 결제 수단을 생성합니다.
   * @param dto 생성 데이터
   * @returns 생성된 결제 수단 row
   */
  async create(dto: CreateUserPaymentMethodDto): Promise<UserPaymentMethodRow> {
    const row = await prisma.userPaymentMethod.create({
      data: {
        userId:             dto.userId,
        pgProvider:         dto.pgProvider,
        billingKey:         dto.billingKey,
        externalCustomerId: dto.externalCustomerId ?? null,
        cardLast4:          dto.cardLast4 ?? null,
        isDefault:          dto.isDefault ?? false,
      },
    });
    return row as UserPaymentMethodRow;
  }

  /**
   * 사용자의 기본(isDefault=true) 결제 수단을 조회합니다.
   * @param userId 사용자 ID
   * @returns 기본 결제 수단 row 또는 null
   */
  async findDefaultByUserId(userId: string): Promise<UserPaymentMethodRow | null> {
    const row = await prisma.userPaymentMethod.findFirst({
      where: { userId, isDefault: true },
      orderBy: { createdAt: 'desc' },
    });
    return row as UserPaymentMethodRow | null;
  }

  /**
   * 사용자의 모든 결제 수단을 최신순으로 조회합니다.
   * @param userId 사용자 ID
   * @returns 결제 수단 row 배열
   */
  async findByUserId(userId: string): Promise<UserPaymentMethodRow[]> {
    const rows = await prisma.userPaymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows as UserPaymentMethodRow[];
  }

  /**
   * ID로 결제 수단 단건을 조회합니다.
   * @param id 결제 수단 ID
   * @returns 결제 수단 row 또는 null
   */
  async findById(id: string): Promise<UserPaymentMethodRow | null> {
    const row = await prisma.userPaymentMethod.findUnique({ where: { id } });
    return row as UserPaymentMethodRow | null;
  }
}
