-- Phase 7: Delivery & fulfillment infrastructure (additive)
-- One fulfillment record per order, DB-enforced by the unique order_id.

CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'ASSIGNED', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'FAILED', 'CANCELLED');

CREATE TYPE "DeliveryFailureReason" AS ENUM ('CUSTOMER_UNAVAILABLE', 'INVALID_ADDRESS', 'DRIVER_UNABLE_TO_COMPLETE', 'PICKUP_STATION_ISSUE', 'OTHER');

CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "fulfillment_type" "DeliveryType" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "delivery_fee_ugx" INTEGER NOT NULL DEFAULT 0,
    "distance_km" DECIMAL(8,3),
    "assigned_admin_id" UUID,
    "address_snapshot" JSONB,
    "station_snapshot" JSONB,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failure_reason" "DeliveryFailureReason",
    "failure_message" VARCHAR(500),
    "notes" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- Exactly ONE delivery per order (business rule: one fulfillment per order).
CREATE UNIQUE INDEX "deliveries_order_id_key" ON "deliveries"("order_id");

-- Valid FKs; assignment is cleared (SET NULL) if the admin record is removed.
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Operational query indexes (status boards, assignment views, type filters)
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");
CREATE INDEX "deliveries_fulfillment_type_idx" ON "deliveries"("fulfillment_type");
CREATE INDEX "deliveries_assigned_admin_id_idx" ON "deliveries"("assigned_admin_id");
CREATE INDEX "deliveries_created_at_idx" ON "deliveries"("created_at");
