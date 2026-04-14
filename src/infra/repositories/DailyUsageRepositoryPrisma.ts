/**
 * 모듈: DailyUsageRepository (Prisma 구현체)
 *
 * 책임:
 * - DailyUsageRepository 포트의 PostgreSQL/Prisma 구현체입니다.
 * - Option B (1:1) 설계: 유저당 단일 row. upsertForToday가 날짜 비교 후 reset or increment를 트랜잭션 내에서 처리합니다.
 *
 * 외부 의존:
 * - PrismaClient: PostgreSQL daily_usages 테이블 접근
 */

import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { DailyUsage } from '../../core/types/persistence/usage.persistence';
import { DailyUsageRepository } from '../../core/ports/DailyUsageRepository';
import prisma from '../db/prisma';

export class DailyUsageRepositoryPrisma implements DailyUsageRepository {
  /**
   * 사용자의 현재 사용량 row를 조회합니다 (유저당 단일 row).
   * @param userId 사용자 식별자 (User.id)
   * @returns DailyUsage 엔티티 또는 null (최초 사용 전)
   */
  async findByUser(userId: string): Promise<DailyUsage | null> {
    const record = await prisma.dailyUsage.findUnique({
      where: { userId },
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  /**
   * 오늘 사용량을 원자적으로 upsert합니다.
   *
   * @description 트랜잭션 내에서 기존 row를 조회한 뒤:
   *   - row 없음 → chatCount=1, lastResetDate=today로 INSERT
   *   - lastResetDate == today → chatCount + 1로 UPDATE
   *   - lastResetDate != today → lastResetDate=today, chatCount=1로 UPDATE (날짜 reset)
   * @param userId 사용자 식별자 (User.id)
   * @param today UTC 기준 오늘 자정 Date 객체
   * @returns upsert 후 최신 DailyUsage
   */
  async upsertForToday(userId: string, today: Date): Promise<DailyUsage> {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // DB데이터 조회
      const existing = await tx.dailyUsage.findUnique({ where: { userId } });

      // 존재 안하고 있으면, chatCount 1로 row 생성
      if (!existing) {
        return tx.dailyUsage.create({
          data: { id: uuidv4(), userId, lastResetDate: today, chatCount: 1 },
        });
      }

      // 존재하면, 오늘 날짜인지 보고,
      // 데이터 Row에 있는 lastResetDate(마지막 갱신일)이 오늘이면, chatCount +1
      // lastResetDate가 오늘이 아니면, 오늘로 바꾸고, chatCount 1로.
      const isSameDay = this.isSameUtcDate(existing.lastResetDate, today);
      return tx.dailyUsage.update({
        where: { userId },
        data: {
          lastResetDate: today,
          chatCount: isSameDay ? { increment: 1 } : 1,
        },
      });
    });

    return this.mapToDomain(result);
  }

  /**
   * 두 Date 객체가 UTC 기준 같은 날짜인지 비교합니다.
   * @param a 비교 대상 Date
   * @param b 비교 대상 Date
   * @returns 같은 날이면 true
   */
  private isSameUtcDate(a: Date, b: Date): boolean {
    return (
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate()
    );
  }

  /**
   * Prisma 레코드 → 도메인 DailyUsage 매핑
   * @param record Prisma dailyUsage 레코드
   * @returns DailyUsage 도메인 엔티티
   */
  private mapToDomain(record: {
    id: string;
    userId: string;
    lastResetDate: Date;
    chatCount: number;
  }): DailyUsage {
    return new DailyUsage({
      id: record.id,
      userId: record.userId,
      lastResetDate: record.lastResetDate,
      chatCount: record.chatCount,
    });
  }
}
