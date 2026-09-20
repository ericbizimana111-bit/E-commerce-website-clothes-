/**
 * Post-audit verification & safe cleanup.
 * 1. Lists (and optionally removes) ONLY rows created by this audit's test
 *    runs, matched by exact slug prefixes: e2e-proof-, image-test-product-,
 *    image-test-cat-, security-test-cat-, image-ref-guard-, unsafe-file-proto-
 * 2. Deletes orphaned files in uploads/images that no DB row references.
 *
 * Deletion order respects FKs (inventory -> images -> translations -> product,
 * translations -> category). Never touches non-test data.
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/db');
const imageService = require('../src/services/image.service');

const TEST_SLUG_PREFIXES = [
  'e2e-proof-product-',
  'image-test-product-',
  'image-ref-guard-',
  'unsafe-file-proto-',
  'security-test-prod-',
];
const TEST_CATEGORY_PREFIXES = ['image-test-cat-', 'security-test-cat-'];

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

async function main() {
  const productSlugs = [...TEST_SLUG_PREFIXES];
  const products = await prisma.product.findMany({
    where: { OR: productSlugs.map((p) => ({ slug: { startsWith: p } })) },
    select: { id: true, slug: true },
  });
  const categories = await prisma.category.findMany({
    where: { OR: TEST_CATEGORY_PREFIXES.map((p) => ({ slug: { startsWith: p } })) },
    select: { id: true, slug: true },
  });

  console.log(`Test products found: ${products.map((p) => `#${p.id} ${p.slug}`).join(', ') || 'none'}`);
  console.log(`Test categories found: ${categories.map((c) => `#${c.id} ${c.slug}`).join(', ') || 'none'}`);

  if (!DRY_RUN) {
    for (const p of products) {
      await prisma.inventoryTransaction.deleteMany({ where: { productId: p.id } });
      await prisma.productImage.deleteMany({ where: { productId: p.id } });
      await prisma.productTranslation.deleteMany({ where: { productId: p.id } });
      await prisma.product.deleteMany({ where: { id: p.id } });
      console.log(`removed product #${p.id} (${p.slug}) with its rows`);
    }
    for (const c of categories) {
      await prisma.categoryTranslation.deleteMany({ where: { categoryId: c.id } });
      await prisma.category.deleteMany({ where: { id: c.id } });
      console.log(`removed category #${c.id} (${c.slug})`);
    }
  }

  // Orphaned files: on disk but referenced by no row
  if (fs.existsSync(imageService.UPLOADS_DIR)) {
    const files = fs.readdirSync(imageService.UPLOADS_DIR);
    for (const file of files) {
      const url = `/images/${file}`;
      const [imgRefs, prodRefs, catRefs] = await Promise.all([
        prisma.productImage.count({ where: { imageUrl: url } }),
        prisma.product.count({ where: { imageUrl: url } }),
        prisma.category.count({ where: { imageUrl: url } }),
      ]);
      if (imgRefs + prodRefs + catRefs === 0) {
        const full = path.join(imageService.UPLOADS_DIR, file);
        if (!DRY_RUN) fs.unlinkSync(full);
        console.log(`${DRY_RUN ? 'orphan file (would delete)' : 'deleted orphan file'}: ${file}`);
      }
    }
  } else {
    console.log('uploads/images does not exist');
  }

  const counts = {};
  for (const k of ['product', 'category', 'productImage', 'order', 'orderItem', 'payment', 'delivery']) {
    counts[k] = await prisma[k].count();
  }
  console.log('final counts:', JSON.stringify(counts));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
