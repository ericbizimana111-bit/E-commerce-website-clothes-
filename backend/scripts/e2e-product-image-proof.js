/**
 * Product management & image workflow — end-to-end proof script.
 *
 * Proves the REAL chain against a live server + PostgreSQL:
 *   admin login -> admin single-product GET -> create product (multilingual)
 *   -> multipart image upload -> DB reference + file on disk -> public serving
 *   -> edit (price/translation) -> language preservation -> inventory restock
 *   -> active/inactive storefront behavior -> image replace/remove
 *   -> full cleanup of ONLY the rows/files this script created.
 *
 * Safety: this script never touches existing products, categories, orders,
 * payments, or deliveries. Historical order snapshots are read-only here.
 *
 * Usage: node scripts/e2e-product-image-proof.js <baseUrl>
 *   e.g. node scripts/e2e-product-image-proof.js http://localhost:4000
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const imageService = require('../src/services/image.service');

const BASE = process.argv[2] || `http://localhost:${env.PORT || 4000}`;
const stamp = Date.now();
const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function api(pathname, { method = 'GET', token = null, body = null, raw = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body: payload });
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

/** Minimal valid 1x1 PNG so the server-side magic-byte check accepts it. */
function tinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
}

async function main() {
  const before = {
    products: await prisma.product.count(),
    categories: await prisma.category.count(),
    images: await prisma.productImage.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    payments: await prisma.payment.count(),
    deliveries: await prisma.delivery.count(),
    inventoryTx: await prisma.inventoryTransaction.count(),
  };
  const sampleOrderItem = await prisma.orderItem.findFirst();

  console.log(`E2E proof against ${BASE}\n`);

  // 1. Admin login (real credentials from env)
  const login = await api('/api/admin/auth/login', {
    method: 'POST',
    body: { email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD },
  });
  check('ADMIN LOGIN', login.status === 200 && login.data?.data?.token, `status ${login.status}`);
  const token = login.data?.data?.token;

  // 2. Admin single-product GET on a REAL existing product (edit-form load path)
  const anyProduct = await prisma.product.findFirst({ orderBy: { id: 'asc' } });
  const single = await api(`/api/admin/catalog/products/${anyProduct.id}`, { token });
  check(
    'ADMIN SINGLE-PRODUCT GET (existing product)',
    single.status === 200 && single.data?.data?.id === anyProduct.id && Array.isArray(single.data?.data?.images),
    `product #${anyProduct.id}`
  );

  // 3. Create product with full multilingual content (en/lg/fr/sw)
  const category = await prisma.category.findFirst({ where: { isActive: true } });
  const create = await api('/api/admin/catalog/products', {
    method: 'POST',
    token,
    body: {
      categoryId: category.id,
      slug: `e2e-proof-product-${stamp}`,
      sku: `E2E-${stamp}`,
      priceUgx: 27500,
      stockQuantity: 7,
      unit: 'kg',
      isActive: true,
      translations: [
        { language: 'en', name: 'E2E Proof Matooke', description: 'E2E English description' },
        { language: 'lg', name: 'E2E Amatooke', description: 'E2E Luganda description' },
        { language: 'fr', name: 'E2E Matooke Frais', description: 'E2E description française' },
        { language: 'sw', name: 'E2E Matooke Safi', description: 'E2E Kiswahili description' },
      ],
    },
  });
  const productId = create.data?.data?.id;
  check(
    'CREATE PRODUCT (multilingual)',
    create.status === 201 && Boolean(productId) && create.data?.data?.translations?.length === 4,
    `product #${productId}, status ${create.status}`
  );

  // 4. Multipart image upload -> storage -> DB reference
  const form = new FormData();
  form.append('image', new Blob([tinyPng()], { type: 'image/png' }), 'whatever-admin-picked.png');
  form.append('altText', 'E2E proof image');
  const upload = await api(`/api/admin/catalog/products/${productId}/images`, { method: 'POST', token, body: form });
  const uploadedUrl = upload.data?.data?.imageUrl;
  check(
    'IMAGE UPLOAD (multipart)',
    upload.status === 201 && /^\/images\/[0-9a-f-]{36}\.png$/.test(uploadedUrl || ''),
    `ref ${uploadedUrl}, server-generated safe name, user filename ignored`
  );

  const fileOnDisk = path.join(imageService.UPLOADS_DIR, path.basename(uploadedUrl || ''));
  check('IMAGE FILE STORED ON DISK', fs.existsSync(fileOnDisk), fileOnDisk);

  const dbImage = await prisma.productImage.findFirst({ where: { productId } });
  check(
    'DB REFERENCE PERSISTED (ProductImage + Product.imageUrl synced)',
    dbImage?.imageUrl === uploadedUrl,
    ''
  );
  const productAfterUpload = await prisma.product.findUnique({ where: { id: productId } });
  check('Product.imageUrl = primary image', productAfterUpload.imageUrl === uploadedUrl, '');

  // 5. Image is publicly served (what the browser <img> tag loads)
  const imgRes = await api(uploadedUrl, { raw: true });
  check(
    'IMAGE PUBLICLY SERVED (GET /images/..., image/png)',
    imgRes.status === 200 && (imgRes.headers.get('content-type') || '').includes('image/png'),
    `status ${imgRes.status}`
  );

  // 6. Customer storefront receives the product + image (public API)
  const publicEn = await api(`/api/products/${productId}?lang=en`);
  check(
    'CUSTOMER API: name/price/stock/image (en)',
    publicEn.status === 200 &&
      publicEn.data?.data?.name === 'E2E Proof Matooke' &&
      publicEn.data?.data?.price === 27500 &&
      publicEn.data?.data?.availability?.inStock === true &&
      publicEn.data?.data?.images?.[0]?.imageUrl === uploadedUrl,
    ''
  );
  const publicLg = await api(`/api/products/${productId}?lang=lg`);
  check(
    'CUSTOMER API: Luganda translation',
    publicLg.data?.data?.name === 'E2E Amatooke' && publicLg.data?.data?.language === 'LG',
    ''
  );
  const publicList = await api(`/api/products?search=${encodeURIComponent('E2E Proof Matooke')}`);
  check(
    'CUSTOMER API: storefront search finds the product',
    (publicList.data?.data || []).some((p) => p.id === productId),
    ''
  );

  // 7. Edit: price + French translation change; other languages preserved
  const edit = await api(`/api/admin/catalog/products/${productId}`, {
    method: 'PUT',
    token,
    body: {
      priceUgx: 31000,
      translations: [
        { language: 'fr', name: 'E2E Matooke Frais Premium', description: 'Nouvelle description française' },
      ],
    },
  });
  check(
    'EDIT PRODUCT (price + French)',
    edit.status === 200 && edit.data?.data?.priceUgx === 31000,
    `status ${edit.status}`
  );
  const afterEdit = await prisma.productTranslation.findMany({ where: { productId } });
  const langs = Object.fromEntries(afterEdit.map((t) => [t.language, t]));
  check(
    'EDITING ONE LANGUAGE PRESERVES THE OTHERS (en/lg/sw intact)',
    langs.FR?.name === 'E2E Matooke Frais Premium' &&
      langs.EN?.name === 'E2E Proof Matooke' &&
      langs.LG?.name === 'E2E Amatooke' &&
      langs.SW?.name === 'E2E Matooke Safi',
    ''
  );
  const publicAfterEdit = await api(`/api/products/${productId}?lang=fr`);
  check(
    'CUSTOMER STOREFRONT REFLECTS THE EDIT (price 31000 + French name)',
    publicAfterEdit.data?.data?.price === 31000 && publicAfterEdit.data?.data?.name === 'E2E Matooke Frais Premium',
    ''
  );

  // 8. Inventory: restock via the dedicated transactional endpoint
  const restock = await api(`/api/admin/catalog/products/${productId}/inventory/restock`, {
    method: 'POST',
    token,
    body: { quantity: 8, reason: 'E2E proof restock' },
  });
  check(
    'INVENTORY RESTOCK (+8)',
    restock.status === 200 && restock.data?.data?.product?.stockQuantity === 15,
    `status ${restock.status}`
  );
  const history = await api(`/api/admin/catalog/products/${productId}/inventory/history`, { token });
  check(
    'INVENTORY HISTORY TRAIL (INITIAL_STOCK + RESTOCK)',
    (history.data?.data || []).some((t) => t.type === 'INITIAL_STOCK') &&
      (history.data?.data || []).some((t) => t.type === 'RESTOCK'),
    ''
  );
  const publicStock = await api(`/api/products/${productId}`);
  check(
    'CUSTOMER AVAILABILITY FOLLOWS INVENTORY (15 in stock)',
    publicStock.data?.data?.availability?.stockQuantity === 15,
    ''
  );

  // 9. Image replacement: upload second image as primary; old file then removed safely
  const form2 = new FormData();
  form2.append('image', new Blob([tinyPng()], { type: 'image/png' }), 'replacement.png');
  form2.append('isPrimary', 'true');
  const upload2 = await api(`/api/admin/catalog/products/${productId}/images`, { method: 'POST', token, body: form2 });
  const replacementUrl = upload2.data?.data?.imageUrl;
  check(
    'IMAGE REPLACE (new primary uploaded)',
    upload2.status === 201 && upload2.data?.data?.isPrimary === true && replacementUrl !== uploadedUrl,
    `new ref ${replacementUrl}`
  );
  const publicReplace = await api(`/api/products/${productId}`);
  check(
    'CUSTOMER RECEIVES THE NEW PRIMARY IMAGE',
    publicReplace.data?.data?.images?.find((i) => i.isPrimary)?.imageUrl === replacementUrl,
    ''
  );
  const oldImageRow = await prisma.productImage.findFirst({ where: { productId, imageUrl: uploadedUrl } });
  await api(`/api/admin/catalog/products/${productId}/images/${oldImageRow.id}`, { method: 'DELETE', token });
  check(
    'IMAGE REMOVE: old row deleted, old file cleaned from disk',
    !(await prisma.productImage.findFirst({ where: { id: oldImageRow.id } })) && !fs.existsSync(fileOnDisk),
    ''
  );

  // 10. Active/inactive storefront behavior
  const deactivate = await api(`/api/admin/catalog/products/${productId}/active`, {
    method: 'PATCH',
    token,
    body: { isActive: false },
  });
  const hiddenList = await api(`/api/products?search=${encodeURIComponent('E2E Proof Matooke')}`);
  const directWhileInactive = await api(`/api/products/${productId}`);
  check(
    'INACTIVE PRODUCT HIDDEN FROM STOREFRONT (list + direct 404)',
    deactivate.status === 200 && directWhileInactive.status === 404 && !(hiddenList.data?.data || []).some((p) => p.id === productId),
    ''
  );
  await api(`/api/admin/catalog/products/${productId}/active`, { method: 'PATCH', token, body: { isActive: true } });
  const reactivated = await api(`/api/products/${productId}`);
  check('REACTIVATED PRODUCT VISIBLE AGAIN', reactivated.status === 200, '');

  // 11. Historical data untouched
  const sampleAfter = await prisma.orderItem.findUnique({ where: { id: sampleOrderItem.id } });
  check(
    'HISTORICAL ORDER SNAPSHOTS UNTOUCHED',
    sampleAfter.unitPriceUgx === sampleOrderItem.unitPriceUgx &&
      sampleAfter.productName === sampleOrderItem.productName,
    ''
  );

  // 12. Cleanup: remove ONLY the rows/files this script created
  const myImages = await prisma.productImage.findMany({ where: { productId } });
  for (const img of myImages) {
    const f = path.join(imageService.UPLOADS_DIR, path.basename(img.imageUrl));
    if (img.imageUrl.startsWith('/images/') && fs.existsSync(f)) fs.unlinkSync(f);
  }
  await prisma.productImage.deleteMany({ where: { productId } });
  await prisma.inventoryTransaction.deleteMany({ where: { productId } });
  await prisma.productTranslation.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { id: productId } });

  const after = {
    products: await prisma.product.count(),
    categories: await prisma.category.count(),
    images: await prisma.productImage.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    payments: await prisma.payment.count(),
    deliveries: await prisma.delivery.count(),
    inventoryTx: await prisma.inventoryTransaction.count(),
  };
  check(
    'DB PRESERVED (orders/payments/deliveries/products identical to before)',
    after.orders === before.orders &&
      after.orderItems === before.orderItems &&
      after.payments === before.payments &&
      after.deliveries === before.deliveries &&
      after.products === before.products &&
      after.categories === before.categories &&
      after.images === before.images &&
      after.inventoryTx === before.inventoryTx,
    ''
  );

  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('E2E proof crashed:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
