/**
 * 모듈: PlanLimitService (플랜 리소스 한도 검증 서비스)
 *
 * 책임:
 * - 플랜별 리소스 한도(매크로 공간 수, 마이크로 공간 수, 파일 저장 용량, 채팅 토큰)를 중앙에서 검증합니다.
 * - ICreditService.getBalance로 사용자 플랜을 조회하고, PLAN_LIMITS 기준으로 한도를 강제합니다.
 * - 한도 초과 시 PlanLimitExceededError(402)를 throw합니다.
 */

import { PLAN_LIMITS } from '../../config/billing.config';
import { PlanLimitExceededError, UpstreamError } from '../../shared/errors/domain';
import type { ICreditService } from '../ports/ICreditService';
import type { PlanType } from '../types/persistence/credit.persistence';
import type { DailyUsage } from '../types/persistence/usage.persistence';
import type { PlanUsageResponseDto } from '../../shared/dtos/me';

/** PlanLimitService가 MacroGraphStore에서 실제로 사용하는 메서드만 추출한 좁은 인터페이스 */
export interface IMacroSpaceCounter {
  countByUserId(userId: string): Promise<number>;
}

/** PlanLimitService가 MicroscopeWorkspaceStore에서 실제로 사용하는 메서드만 추출한 좁은 인터페이스 */
export interface IMicroSpaceCounter {
  countByUserId(userId: string): Promise<number>;
  getTotalFileSizeByUserId(userId: string): Promise<number>;
}

/** PlanLimitService가 DailyUsageService에서 실제로 사용하는 메서드만 추출한 좁은 인터페이스 */
export interface IDailyUsageLimiter {
  checkTokenLimit(userId: string, planType: PlanType): Promise<void>;
  addTokens(userId: string, tokenCount: bigint, planType: PlanType): Promise<void>;
  /**
   * 오늘 날짜의 일일 사용량 스냅샷을 반환합니다.
   * 날짜가 바뀐 경우 null을 반환합니다.
   */
  getTodayUsage(userId: string): Promise<DailyUsage | null>;
}

export class PlanLimitService {
  constructor(
    private readonly creditService: ICreditService,
    private readonly macroGraphStore: IMacroSpaceCounter,
    private readonly microscopeWorkspaceStore: IMicroSpaceCounter,
    private readonly dailyUsageService: IDailyUsageLimiter
  ) {}

  /**
   * 사용자의 현재 플랜 타입을 조회합니다.
   * @param userId 사용자 식별자
   */
  private async getPlanType(userId: string) {
    const balance = await this.creditService.getBalance(userId);
    return balance.planType;
  }

  /**
   * AI 채팅 토큰 한도를 확인합니다.
   * @param userId 사용자 식별자
   * @throws {PlanLimitExceededError} 일일 토큰 한도 초과 시
   * @throws {UpstreamError} DB 조회 실패 시
   */
  async checkChatTokenLimit(userId: string): Promise<void> {
    try {
      const planType = await this.getPlanType(userId);
      await this.dailyUsageService.checkTokenLimit(userId, planType);
    } catch (err) {
      if (err instanceof PlanLimitExceededError) throw err;
      throw new UpstreamError('PlanLimitService.checkChatTokenLimit failed', { cause: String(err) });
    }
  }

  /**
   * AI 채팅 완료 후 토큰 사용량을 기록합니다.
   * @param userId 사용자 식별자
   * @param tokenCount 소비한 토큰 수 (input + output)
   */
  async recordChatTokens(userId: string, tokenCount: bigint): Promise<void> {
    try {
      const planType = await this.getPlanType(userId);
      await this.dailyUsageService.addTokens(userId, tokenCount, planType);
    } catch (err) {
      throw new UpstreamError('PlanLimitService.recordChatTokens failed', { cause: String(err) });
    }
  }

  /**
   * 매크로 공간(MacroView) 생성 한도를 확인합니다.
   * @param userId 사용자 식별자
   * @throws {PlanLimitExceededError} 매크로 공간 수 한도 초과 시
   * @throws {UpstreamError} DB 조회 실패 시
   */
  async checkMacroSpaceLimit(userId: string): Promise<void> {
    try {
      const planType = await this.getPlanType(userId);
      const limit = PLAN_LIMITS[planType].macroSpaceCount;
      if (limit === null) return; // ENTERPRISE: 무제한

      const current = await this.macroGraphStore.countByUserId(userId);
      if (current >= limit) {
        throw new PlanLimitExceededError(
          `매크로 공간 한도(${limit}개)에 도달했습니다. 기존 공간을 삭제하거나 플랜을 업그레이드해 주세요.`
        );
      }
    } catch (err) {
      if (err instanceof PlanLimitExceededError) throw err;
      throw new UpstreamError('PlanLimitService.checkMacroSpaceLimit failed', { cause: String(err) });
    }
  }

  /**
   * 마이크로 데이터 공간(MicroscopeWorkspace) 생성 한도를 확인합니다.
   * @param userId 사용자 식별자
   * @throws {PlanLimitExceededError} 마이크로 공간 수 한도 초과 시
   * @throws {UpstreamError} DB 조회 실패 시
   */
  async checkMicroSpaceLimit(userId: string): Promise<void> {
    try {
      const planType = await this.getPlanType(userId);
      const limit = PLAN_LIMITS[planType].microSpaceCount;
      if (limit === null) return; // ENTERPRISE: 무제한

      const current = await this.microscopeWorkspaceStore.countByUserId(userId);
      if (current >= limit) {
        throw new PlanLimitExceededError(
          `마이크로 데이터 공간 한도(${limit}개)에 도달했습니다. 기존 공간을 삭제하거나 플랜을 업그레이드해 주세요.`
        );
      }
    } catch (err) {
      if (err instanceof PlanLimitExceededError) throw err;
      throw new UpstreamError('PlanLimitService.checkMicroSpaceLimit failed', { cause: String(err) });
    }
  }

  /**
   * 파일 업로드 전 저장 용량 한도를 확인합니다.
   * @param userId 사용자 식별자
   * @param incomingBytes 업로드하려는 파일 크기 합계 (bytes)
   * @throws {PlanLimitExceededError} 파일 저장 용량 한도 초과 시
   * @throws {UpstreamError} DB 조회 실패 시
   */
  async checkFileStorageLimit(userId: string, incomingBytes: number): Promise<void> {
    try {
      const planType = await this.getPlanType(userId);
      const limit = PLAN_LIMITS[planType].fileStorageBytes;
      if (limit === null) return; // ENTERPRISE: 무제한

      const used = await this.microscopeWorkspaceStore.getTotalFileSizeByUserId(userId);
      const total = BigInt(used) + BigInt(incomingBytes);
      if (total > limit) {
        const limitGb = Number(limit) / (1024 * 1024 * 1024);
        throw new PlanLimitExceededError(
          `파일 저장 용량 한도(${limitGb}GB)를 초과합니다. 기존 파일을 삭제하거나 플랜을 업그레이드해 주세요.`
        );
      }
    } catch (err) {
      if (err instanceof PlanLimitExceededError) throw err;
      throw new UpstreamError('PlanLimitService.checkFileStorageLimit failed', { cause: String(err) });
    }
  }

  /**
   * 사용자의 현재 플랜 리소스 사용량 스냅샷을 반환합니다.
   *
   * @description
   * chatTokens·macroSpace·microSpace·fileStorage 네 개 리소스의 현재 사용량과
   * 플랜 한도를 병렬로 집계합니다. Enterprise 플랜은 limit/limitBytes = null (무제한).
   * chatTokens.used는 오늘(UTC 자정 기준) 소비된 토큰 수이며, 날짜가 바뀌기 전까지 유효합니다.
   *
   * @param userId 사용자 식별자 (User.id, UUID)
   * @returns PlanUsageResponseDto — 각 리소스의 used/limit 쌍을 포함한 스냅샷
   * @throws {UpstreamError} 플랜 조회 또는 사용량 집계 실패 시
   */
  async getPlanUsage(userId: string): Promise<PlanUsageResponseDto> {
    try {
      const planType = await this.getPlanType(userId);
      const limits = PLAN_LIMITS[planType];

      const [todayUsage, macroCount, microCount, totalFileSize] = await Promise.all([
        this.dailyUsageService.getTodayUsage(userId),
        this.macroGraphStore.countByUserId(userId),
        this.microscopeWorkspaceStore.countByUserId(userId),
        this.microscopeWorkspaceStore.getTotalFileSizeByUserId(userId),
      ]);

      const chatTokensUsed = todayUsage ? Number(todayUsage.chatTokens) : 0;

      return {
        planType: planType as PlanUsageResponseDto['planType'],
        chatTokens: {
          used: chatTokensUsed,
          limit: limits.dailyChatTokens !== null ? Number(limits.dailyChatTokens) : null,
        },
        macroSpace: {
          used: macroCount,
          limit: limits.macroSpaceCount,
        },
        microSpace: {
          used: microCount,
          limit: limits.microSpaceCount,
        },
        fileStorage: {
          usedBytes: totalFileSize,
          limitBytes: limits.fileStorageBytes !== null ? Number(limits.fileStorageBytes) : null,
        },
      };
    } catch (err) {
      throw new UpstreamError('PlanLimitService.getPlanUsage failed', { cause: String(err) });
    }
  }
}
