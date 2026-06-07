-- Harden payment provider linkage without duplicating pg_provider on subscriptions.
ALTER TYPE "WebhookEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_READY';
ALTER TYPE "WebhookEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_REFUNDED';
ALTER TYPE "WebhookEventType" ADD VALUE IF NOT EXISTS 'WEBHOOK_IGNORED';

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "payment_method_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_subscription_payment_method"
  ON "subscriptions"("payment_method_id");

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_payment_method_id_fkey"
  FOREIGN KEY ("payment_method_id")
  REFERENCES "user_payment_methods"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
