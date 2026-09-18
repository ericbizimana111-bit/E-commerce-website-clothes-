-- Phase 8: Balance payment & order completion infrastructure (additive)

-- 1. Add BALANCE_ONLINE to PaymentType enum
ALTER TYPE "PaymentType" ADD VALUE 'BALANCE_ONLINE';

-- 2. Financial invariant: at most ONE successful BALANCE payment per order,
--    enforced by the database (partial unique index).
CREATE UNIQUE INDEX "payments_one_successful_balance_per_order"
  ON "payments"("order_id")
  WHERE "purpose" = 'BALANCE' AND "status" = 'SUCCESS';
