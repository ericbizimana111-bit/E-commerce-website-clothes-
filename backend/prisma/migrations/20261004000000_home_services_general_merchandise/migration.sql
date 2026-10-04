-- Home services (catalogue, technicians, bookings), general-merchandise product
-- fields (brand, specs, compare-at price, featured) and delivery limits.
-- Purely additive: no existing column or data is modified.

-- CreateEnum
CREATE TYPE "ServicePriceType" AS ENUM ('FIXED', 'HOURLY', 'INSPECTION');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServicePaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "service_request_id" UUID;

-- AlterTable
ALTER TABLE "delivery_pricing_config" ADD COLUMN     "max_delivery_km" DECIMAL(7,2),
ADD COLUMN     "warehouse_name" VARCHAR(200);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand" VARCHAR(100),
ADD COLUMN     "compare_at_price_ugx" INTEGER,
ADD COLUMN     "is_featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "specifications" JSONB;

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(150) NOT NULL,
    "description_en" TEXT,
    "translations" JSONB,
    "icon" VARCHAR(50),
    "image_url" TEXT,
    "price_type" "ServicePriceType" NOT NULL DEFAULT 'INSPECTION',
    "price_from_ugx" INTEGER NOT NULL DEFAULT 0,
    "duration_text" VARCHAR(60),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_providers" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "coverage" VARCHAR(300),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_provider_skills" (
    "provider_id" UUID NOT NULL,
    "service_id" INTEGER NOT NULL,

    CONSTRAINT "service_provider_skills_pkey" PRIMARY KEY ("provider_id","service_id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "request_number" VARCHAR(30) NOT NULL,
    "user_id" UUID NOT NULL,
    "service_id" INTEGER NOT NULL,
    "address_id" UUID,
    "address_snapshot" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "preferred_date" DATE NOT NULL,
    "preferred_slot" VARCHAR(20) NOT NULL,
    "contact_phone" VARCHAR(30) NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "price_type" "ServicePriceType" NOT NULL,
    "price_from_ugx" INTEGER NOT NULL,
    "quoted_price_ugx" INTEGER,
    "distance_km" DECIMAL(8,3),
    "eta_minutes" INTEGER,
    "distance_source" VARCHAR(20),
    "provider_id" UUID,
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "payment_status" "ServicePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "payment_method" "PaymentProvider",
    "payment_ref" VARCHAR(100),
    "cancel_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_request_events" (
    "id" SERIAL NOT NULL,
    "request_id" UUID NOT NULL,
    "status_from" "ServiceRequestStatus",
    "status_to" "ServiceRequestStatus" NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "admin_id" UUID,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE INDEX "services_is_active_idx" ON "services"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_request_number_key" ON "service_requests"("request_number");

-- CreateIndex
CREATE INDEX "service_requests_user_id_idx" ON "service_requests"("user_id");

-- CreateIndex
CREATE INDEX "service_requests_status_idx" ON "service_requests"("status");

-- CreateIndex
CREATE INDEX "service_requests_created_at_idx" ON "service_requests"("created_at");

-- CreateIndex
CREATE INDEX "service_request_events_request_id_idx" ON "service_request_events"("request_id");

-- CreateIndex
CREATE INDEX "products_brand_idx" ON "products"("brand");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_provider_skills" ADD CONSTRAINT "service_provider_skills_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "service_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_provider_skills" ADD CONSTRAINT "service_provider_skills_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "service_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_events" ADD CONSTRAINT "service_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_events" ADD CONSTRAINT "service_request_events_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

