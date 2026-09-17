-- Phase 5: Orders & Order Lifecycle
-- Additive only: new columns, indexes, and defaults. No tables or columns are dropped.

-- 1. Currency stamp on orders (integer UGX everywhere else is unchanged)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'UGX';

-- 2. Index for address lookups (ownership checks on order creation)
CREATE INDEX IF NOT EXISTS "addresses_user_id_idx" ON "addresses"("user_id");

-- 3. Index for joining order items (customer order detail queries)
CREATE INDEX IF NOT EXISTS "order_items_order_id_idx" ON "order_items"("order_id");
