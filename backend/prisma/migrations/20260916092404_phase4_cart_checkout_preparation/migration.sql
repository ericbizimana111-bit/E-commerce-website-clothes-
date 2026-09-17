-- AlterTable
ALTER TABLE "category_translations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "product_images" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "product_translations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "image_url" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "categories_is_active_idx" ON "categories"("is_active");
