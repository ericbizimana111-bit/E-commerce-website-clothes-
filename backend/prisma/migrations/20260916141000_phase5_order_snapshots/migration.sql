-- Phase 5 (part 2): immutable fulfillment snapshots on orders
-- Historical orders must not change when addresses/stations are edited later.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "address_snapshot" JSONB;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "station_snapshot" JSONB;
