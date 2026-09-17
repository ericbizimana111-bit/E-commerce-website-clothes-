-- Phase 4: Shopping Cart & Checkout Preparation
-- Additive only. No existing columns/tables are dropped or altered destructively.

-- 1. Server-side price snapshot for cart items (integer UGX, nullable during transition)
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "unit_price_ugx" INTEGER;

-- 2. Backfill existing cart items with the current authoritative product price
UPDATE "cart_items" ci
SET "unit_price_ugx" = p."price_ugx"
FROM "products" p
WHERE ci."product_id" = p."id"
  AND ci."unit_price_ugx" IS NULL;
