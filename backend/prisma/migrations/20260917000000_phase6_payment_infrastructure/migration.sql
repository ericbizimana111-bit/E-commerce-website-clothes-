-- Phase 6: Payment & commitment-payment infrastructure (additive)
-- Extends the existing payments table. The payments table contained 0 rows when
-- this migration was authored (verified), so the PaymentStatus value rename
-- INITIATED -> PENDING renames no data; it only removes an unused enum variant.

-- 1. Payment purpose (Phase 6 implements COMMITMENT only; BALANCE is reserved
--    for the existing cash-balance business process, NOT collected online here)
CREATE TYPE "PaymentPurpose" AS ENUM ('COMMITMENT', 'BALANCE');

-- 2. Machine-readable verification result codes
CREATE TYPE "PaymentResultCode" AS ENUM ('NONE', 'SUCCESS', 'INSUFFICIENT_FUNDS', 'TIMEOUT', 'DECLINED', 'CANCELLED_BY_USER', 'INVALID_REFERENCE', 'PROVIDER_ERROR');

-- 3. Payment status machine: rename INITIATED -> PENDING and add lifecycle states
ALTER TYPE "PaymentStatus" RENAME VALUE 'INITIATED' TO 'PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';

-- 4. New columns
ALTER TABLE "payments"
  ADD COLUMN "purpose" "PaymentPurpose" NOT NULL DEFAULT 'COMMITMENT',
  ADD COLUMN "result_code" "PaymentResultCode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "failure_message" VARCHAR(500),
  ADD COLUMN "expires_at" TIMESTAMP(3);

-- 5. Indexes (providerRef lookup for webhook correlation, status scans)
CREATE INDEX "payments_provider_ref_idx" ON "payments"("provider_ref");
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- 6. Provider reference uniqueness: one payment row per (provider, providerRef)
--    so webhook retries can never be associated with two different payments.
CREATE UNIQUE INDEX "payments_provider_provider_ref_key" ON "payments"("provider", "provider_ref");

-- 7. Financial invariant: at most ONE successful COMMITMENT payment per order,
--    enforced by the database (not application code) so concurrent verifications
--    cannot double-apply a commitment payment. (Partial unique index.)
CREATE UNIQUE INDEX "payments_one_successful_commitment_per_order"
  ON "payments"("order_id")
  WHERE "purpose" = 'COMMITMENT' AND "status" = 'SUCCESS';
