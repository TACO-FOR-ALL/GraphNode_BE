import cron from 'node-cron';

import { container } from '../../bootstrap/container';
import { logger } from '../../shared/utils/logger';
import { BILLING_CYCLE_DAYS } from '../../config/billing.config';

/**
 * BillingCron 클래스
 *
 * 책임:
 * - 매시간: 만료된 HOLD 트랜잭션을 자동으로 rollback (expireStaleHolds)
 * - 매 청구주기(billing.config.ts: BILLING_CYCLE_DAYS 기준): 만료된 구독자의 크레딧을 재충전 (refillAllActiveSubscribers)
 *
 * 스케줄:
 * - Hold 만료 청소: 0 * * * *   (매시간 정각)
 * - 구독 갱신:      BILLING_CYCLE_DAYS 기반으로 cron 표현식을 동적으로 생성
 *   - 30일 주기 → '0 1 1 * *' (매월 1일 01:00)
 *   - 그 외 주기  → '0 1 * * *' (매일 01:00, fallback)
 *
 * 등록:
 * - bootstrap/server.ts 의 bootstrap() 함수에서 BillingCron.start() 호출
 */
export class BillingCron {
  /**
   * 크론 잡을 시작합니다.
   * 서버 부트스트랩 시점에 호출되어야 합니다.
   */
  static start(): void {
    BillingCron.scheduleHoldExpiry();
    BillingCron.scheduleSubscriptionRefill();
  }

  // ── Private schedulers ──────────────────────────────────────────────────────

  /**
   * 매시간 정각: 만료된 HOLD 트랜잭션 자동 rollback.
   * 비동기 작업(SQS)이 응답 없이 종료된 경우 사용자의 크레딧이
   * holdAmount 에 영구적으로 묶이는 것을 방지합니다.
   */
  private static scheduleHoldExpiry(): void {
    cron.schedule('0 * * * *', async () => {
      logger.info('[BillingCron] Starting stale hold expiry...');
      try {
        const creditService = container.getCreditService();
        await creditService.expireStaleHolds();
        logger.info('[BillingCron] Stale hold expiry completed.');
      } catch (err) {
        logger.error({ err }, '[BillingCron] Stale hold expiry failed.');
      }
    });

    logger.info('[BillingCron] Scheduled stale hold expiry (every hour at :00).');
  }

  /**
   * 청구 주기 기반: 만료된 구독자의 크레딧 재충전 (refillAllActiveSubscribers).
   *
   * billing.config.ts 의 BILLING_CYCLE_DAYS 상수를 읽어 스케줄을 동적으로 설정합니다.
   * - 30일(기본): '0 1 1 * *'  → 매월 1일 01:00
   * - 그 외 일수: '0 1 * * *'  → 매일 01:00 (배치가 DB 상 cycleEnd 기준으로 처리하므로 안전)
   */
  private static scheduleSubscriptionRefill(): void {
    // 주기에 상관없이 매일 새벽 01:00에 실행하여 '오늘 갱신 대상자'를 찾습니다.
    // 사용자가 접속 시 JIT(Just-In-Time)로 즉시 갱신되지만, 미접속 유저를 위해 매일 배치를 돌립니다.
    const cronExpr = '0 1 * * *';
    const scheduleLabel = `daily at 01:00 (cycle=${BILLING_CYCLE_DAYS}d, filtered by DB)`;

    cron.schedule(cronExpr, async () => {
      logger.info('[BillingCron] Starting subscription credit refill...');
      try {
        const creditService = container.getCreditService();
        await creditService.refillAllActiveSubscribers();
        logger.info('[BillingCron] Subscription credit refill completed.');
      } catch (err) {
        logger.error({ err }, '[BillingCron] Subscription credit refill failed.');
      }
    });

    logger.info(`[BillingCron] Scheduled subscription refill (${scheduleLabel}).`);
  }
}
