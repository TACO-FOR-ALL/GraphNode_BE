/**
 * 모듈: DailyUsageRepository (Prisma 구현체)
 *
 * 책임:
 * - DailyUsageRepository 포트의 PostgreSQL/Prisma 구현체입니다.
 * - Option B (1:1) 설계: 유저당 단일 row. addTokens가 날짜 비교 후 reset or 누적을 처리합니다.
 */

import { v4 as uuidv4 } from 'uuid';
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
   * 오늘 사용한 토큰 수를 원자적으로 누적합니다.
   *
   * @param userId 사용자 식별자 (User.id)
   * @param tokenCount 이번 AI 호출에서 소비한 토큰 수 (input + output)
   * @param today UTC 기준 오늘 자정 Date 객체
   * @returns upsert 후 최신 DailyUsage
   */
  async addTokens(userId: string, tokenCount: bigint, today: Date): Promise<DailyUsage> {
    const existing = await prisma.dailyUsage.findUnique({ where: { userId } });

    if (!existing) {
      const created = await prisma.dailyUsage.create({
        data: { id: uuidv4(), userId, lastResetDate: today, chatTokens: tokenCount },
      });
      return this.mapToDomain(created);
    }

    const isSameDay = this.isSameUtcDate(existing.lastResetDate, today);
    const updated = await prisma.dailyUsage.update({
      where: { userId },
      data: {
        lastResetDate: today,
        chatTokens: isSameDay ? { increment: tokenCount } : tokenCount,
      },
    });

    return this.mapToDomain(updated);
  }

  private isSameUtcDate(a: Date, b: Date): boolean {
    return (
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate()
    );
  }

  private mapToDomain(record: {
    id: string;
    userId: string;
    lastResetDate: Date;
    chatTokens: bigint;
  }): DailyUsage {
    return new DailyUsage({
      id: record.id,
      userId: record.userId,
      lastResetDate: record.lastResetDate,
      chatTokens: record.chatTokens,
    });
  }
}
