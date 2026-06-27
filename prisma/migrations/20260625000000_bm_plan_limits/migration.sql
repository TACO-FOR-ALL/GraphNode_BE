-- Migration: BM Plan Limits
-- Generated: 2026-06-25
-- ⚠️ 사용자 승인 후 `npx prisma migrate deploy` 또는 `npx prisma migrate dev` 실행

-- 1. PlanType enum에 BASIC, PLUS 추가
ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'BASIC';
ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'PLUS';

-- 2. DailyUsage: chat_count (Int) → chat_tokens (BigInt)
--    기존 데이터: chat_count 값을 * 1000 (평균 1회 ≈ 1000 토큰 추정)으로 변환
--    또는 0으로 초기화 (BM 미사용 상태였으므로 0으로 초기화해도 무방)
ALTER TABLE "daily_usages" ADD COLUMN IF NOT EXISTS "chat_tokens" BIGINT NOT NULL DEFAULT 0;
UPDATE "daily_usages" SET "chat_tokens" = 0;  -- 기존 데이터 초기화 (사용 이력 없음)
ALTER TABLE "daily_usages" DROP COLUMN IF EXISTS "chat_count";
