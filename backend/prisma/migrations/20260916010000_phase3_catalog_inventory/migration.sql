-- Phase 3: Multilingual Catalog & Inventory Foundation Migration

-- 1. Create Enums
CREATE TYPE "Language" AS ENUM ('EN', 'LG', 'FR', 'SW');
CREATE TYPE "InventoryTransactionType" AS ENUM ('INITIAL_STOCK', 'RESTOCK', 'ADJUSTMENT', 'SALE', 'RESERVATION', 'RELEASE', 'RETURN', 'CORRECTION');

-- 2. Alter Categories
ALTER TABLE "categories" ALTER COLUMN "name_en" DROP NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "name_lg" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "categories_display_order_idx" ON "categories"("display_order");

-- 3. Alter Products (Columns and Constraints)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "slug" VARCHAR(200);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sku" VARCHAR(50);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_quantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ALTER COLUMN "unit" SET DEFAULT 'piece';
ALTER TABLE "products" ALTER COLUMN "name_en" DROP NOT NULL;
ALTER TABLE "products" ALTER COLUMN "name_lg" DROP NOT NULL;
ALTER TABLE "products" ALTER COLUMN "stock" DROP NOT NULL;

-- Populate existing products with clean unique slugs, SKUs, and stock_quantity
UPDATE "products" SET
  "slug" = CASE "id"
    WHEN 1 THEN 'fresh-green-matooke-cluster'
    WHEN 2 THEN 'sweet-potatoes-lumonde'
    WHEN 3 THEN 'nakati-greens'
    WHEN 4 THEN 'sukuma-wiki-collard-greens'
    WHEN 5 THEN 'sugar-bananas-sukali-ndizi'
    WHEN 6 THEN 'ugandan-hass-avocado'
    WHEN 7 THEN 'lake-victoria-fresh-tilapia'
    WHEN 8 THEN 'prime-beef-ennyama'
    WHEN 9 THEN 'super-aromatic-rice'
    WHEN 10 THEN 'fresh-farm-milk'
    ELSE 'product-' || "id"
  END,
  "sku" = 'UFM-PROD-' || LPAD("id"::text, 4, '0'),
  "stock_quantity" = COALESCE(ROUND("stock")::integer, 0)
WHERE "slug" IS NULL;

ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_key" ON "products"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "products_sku_key" ON "products"("sku");
CREATE INDEX IF NOT EXISTS "products_stock_quantity_idx" ON "products"("stock_quantity");
CREATE INDEX IF NOT EXISTS "products_price_ugx_idx" ON "products"("price_ugx");

-- 4. Create Category Translations Table
CREATE TABLE "category_translations" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "language" "Language" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "category_translations_category_id_language_key" ON "category_translations"("category_id", "language");
CREATE INDEX "category_translations_language_idx" ON "category_translations"("language");
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Category Translations from existing rows
INSERT INTO "category_translations" ("category_id", "language", "name", "created_at", "updated_at")
SELECT "id", 'EN'::"Language", "name_en", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "categories" WHERE "name_en" IS NOT NULL
ON CONFLICT ("category_id", "language") DO NOTHING;

INSERT INTO "category_translations" ("category_id", "language", "name", "created_at", "updated_at")
SELECT "id", 'LG'::"Language", "name_lg", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "categories" WHERE "name_lg" IS NOT NULL
ON CONFLICT ("category_id", "language") DO NOTHING;

-- 5. Create Product Translations Table
CREATE TABLE "product_translations" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "language" "Language" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_translations_product_id_language_key" ON "product_translations"("product_id", "language");
CREATE INDEX "product_translations_language_idx" ON "product_translations"("language");
CREATE INDEX "product_translations_name_idx" ON "product_translations"("name");
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Product Translations from existing rows
INSERT INTO "product_translations" ("product_id", "language", "name", "description", "created_at", "updated_at")
SELECT "id", 'EN'::"Language", "name_en", "description_en", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "products" WHERE "name_en" IS NOT NULL
ON CONFLICT ("product_id", "language") DO NOTHING;

INSERT INTO "product_translations" ("product_id", "language", "name", "description", "created_at", "updated_at")
SELECT "id", 'LG'::"Language", "name_lg", "description_lg", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "products" WHERE "name_lg" IS NOT NULL
ON CONFLICT ("product_id", "language") DO NOTHING;

-- 6. Create Product Images Table
CREATE TABLE "product_images" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "alt_text" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill primary images from existing image_url column
INSERT INTO "product_images" ("product_id", "image_url", "alt_text", "sort_order", "is_primary", "created_at", "updated_at")
SELECT "id", "image_url", "name_en", 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "products" WHERE "image_url" IS NOT NULL;

-- 7. Create Inventory Transactions Table
CREATE TABLE "inventory_transactions" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity_change" INTEGER NOT NULL,
    "previous_quantity" INTEGER NOT NULL,
    "new_quantity" INTEGER NOT NULL,
    "type" "InventoryTransactionType" NOT NULL,
    "reason" VARCHAR(255),
    "reference_id" VARCHAR(100),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_transactions_product_id_idx" ON "inventory_transactions"("product_id");
CREATE INDEX "inventory_transactions_created_at_idx" ON "inventory_transactions"("created_at");
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill initial inventory transactions for existing products
INSERT INTO "inventory_transactions" ("product_id", "quantity_change", "previous_quantity", "new_quantity", "type", "reason", "created_at")
SELECT "id", "stock_quantity", 0, "stock_quantity", 'INITIAL_STOCK'::"InventoryTransactionType", 'Initial stock baseline migration', CURRENT_TIMESTAMP FROM "products";
