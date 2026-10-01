-- Marketplace expansion: verified Uganda addresses, delivery distance/ETA,
-- machine-translation flags, category icons, admin notifications, support chat.
-- Purely additive: no existing column or data is modified.

-- CreateEnum
CREATE TYPE "ChatSender" AS ENUM ('CUSTOMER', 'ADMIN');

-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "contact_phone" VARCHAR(30),
ADD COLUMN     "formatted_address" TEXT,
ADD COLUMN     "is_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "landmark" VARCHAR(300),
ADD COLUMN     "region" VARCHAR(30);

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "icon" VARCHAR(50);

-- AlterTable
ALTER TABLE "category_translations" ADD COLUMN     "is_auto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "distance_source" VARCHAR(20),
ADD COLUMN     "eta_minutes" INTEGER,
ADD COLUMN     "straight_line_km" DECIMAL(8,3);

-- AlterTable
ALTER TABLE "product_translations" ADD COLUMN     "is_auto" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "admin_notifications" (
    "id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "message" TEXT NOT NULL,
    "link_url" TEXT,
    "order_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notification_reads" (
    "notification_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notification_reads_pkey" PRIMARY KEY ("notification_id","admin_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "last_message" VARCHAR(300),
    "customer_unread" INTEGER NOT NULL DEFAULT 0,
    "admin_unread" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_type" "ChatSender" NOT NULL,
    "sender_admin_id" UUID,
    "body" TEXT NOT NULL,
    "order_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_notifications_created_at_idx" ON "admin_notifications"("created_at");

-- CreateIndex
CREATE INDEX "admin_notifications_type_idx" ON "admin_notifications"("type");

-- CreateIndex
CREATE INDEX "admin_notification_reads_admin_id_idx" ON "admin_notification_reads"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_user_id_key" ON "conversations"("user_id");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- AddForeignKey
ALTER TABLE "admin_notification_reads" ADD CONSTRAINT "admin_notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "admin_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notification_reads" ADD CONSTRAINT "admin_notification_reads_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_admin_id_fkey" FOREIGN KEY ("sender_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

