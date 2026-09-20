const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const imageService = require('../src/services/image.service');
const { signAdminToken, signCustomerToken } = require('../src/services/token.service');

/**
 * Product image upload/removal workflow (admin multipart upload).
 * Covers: valid upload + persistence + public retrieval, signature/type/size
 * validation, authorization (customer 401, dispatcher 403), missing product
 * 404, removal with reference-counted file cleanup, primary promotion, and
 * the admin single-product endpoint used by the admin edit form.
 */

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
  'base64'
);

const FAKE_IMAGE = Buffer.from('this is definitely not an image, just plain text payload');

describe('Product Image Upload & Removal Workflow', () => {
  let superAdminToken = null;
  let dispatcherToken = null;
  let customerToken = null;
  let categoryId = null;
  let productId = null;
  const createdFilenames = [];

  function trackFile(imageUrl) {
    if (typeof imageUrl === 'string' && imageUrl.startsWith('/images/')) {
      createdFilenames.push(imageService.UPLOADS_DIR + path.sep + path.basename(imageUrl));
    }
  }

  beforeAll(async () => {
    const adminRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    superAdminToken = adminRes.body.data.token;

    const dispatcher = await prisma.admin.upsert({
      where: { email: 'dispatcher.images@ugandafood.market' },
      update: { role: 'DISPATCHER', isActive: true },
      create: {
        fullName: 'Image Test Dispatcher',
        email: 'dispatcher.images@ugandafood.market',
        passwordHash: '$2a$12$eXampleHashedPasswordForTestOnly999999999999999999999999',
        role: 'DISPATCHER',
        isActive: true,
      },
    });
    dispatcherToken = signAdminToken(dispatcher);

    customerToken = signCustomerToken({
      id: '00000000-0000-0000-0000-000000000077',
      phone: '+256770000011',
    });

    const catRes = await request(app)
      .post('/api/admin/catalog/categories')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        slug: 'image-test-cat-' + Date.now(),
        translations: [{ language: 'en', name: 'Image Test Category' }],
      });
    categoryId = catRes.body.data.id;

    const prodRes = await request(app)
      .post('/api/admin/catalog/products')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        categoryId,
        slug: 'image-test-product-' + Date.now(),
        priceUgx: 15000,
        stockQuantity: 5,
        translations: [{ language: 'en', name: 'Image Test Product' }],
      });
    productId = prodRes.body.data.id;
  });

  afterAll(async () => {
    for (const file of createdFilenames) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {
        /* best effort cleanup */
      }
    }
    if (productId) {
      // InventoryTransaction.product is onDelete: Restrict — clear this test
      // product's own inventory trail before deleting it (test rows only).
      await prisma.inventoryTransaction.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (categoryId) {
      await prisma.categoryTranslation.deleteMany({ where: { categoryId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
    }
    await prisma.admin.deleteMany({ where: { email: 'dispatcher.images@ugandafood.market' } });
    await prisma.$disconnect();
  });

  describe('Authorization', () => {
    test('rejects upload without a token (401)', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${productId}/images`)
        .attach('image', TINY_PNG, { filename: 'a.png', contentType: 'image/png' });
      expect(res.statusCode).toBe(401);
    });

    test('rejects upload with a customer token (401 context isolation)', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${productId}/images`)
        .set('Authorization', `Bearer ${customerToken}`)
        .attach('image', TINY_PNG, { filename: 'a.png', contentType: 'image/png' });
      expect(res.statusCode).toBe(401);
    });

    test('rejects upload by DISPATCHER (403 RBAC)', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${productId}/images`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .attach('image', TINY_PNG, { filename: 'a.png', contentType: 'image/png' });
      expect(res.statusCode).toBe(403);
    });

    test('returns 404 for a nonexistent product', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/products/999999999/images')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('image', TINY_PNG, { filename: 'a.png', contentType: 'image/png' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Validation', () => {
    test('rejects a plain-text file faking image/png (signature mismatch, 400)', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${productId}/images`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('image', FAKE_IMAGE, { filename: 'fake.png', contentType: 'image/png' });
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.body.message || res.body.errors)).toMatch(/not a valid|image/i);
    });

    test('rejects unsupported MIME type (text/plain, 400)', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${productId}/images`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('image', FAKE_IMAGE, { filename: 'notes.txt', contentType: 'text/plain' });
      expect(res.statusCode).toBe(400);
    });

    test('rejects a file whose content does not match its declared type (PNG bytes declared GIF, 400)', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${productId}/images`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('image', TINY_PNG, { filename: 'mismatch.gif', contentType: 'image/gif' });
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.body.message || res.body.errors)).toMatch(/does not match/i);
    });

    test('rejects an upload exceeding the 5 MB limit (400)', async () => {
      const oversized = Buffer.concat([TINY_PNG, Buffer.alloc(6 * 1024 * 1024, 0)]);
      const res = await request(app)
        .post(`/api/admin/catalog/products/${productId}/images`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('image', oversized, { filename: 'big.png', contentType: 'image/png' });
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.body.message || res.body.errors)).toMatch(/5 MB|size/i);
    });

    test('rejects an upload with no file attached (400)', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${productId}/images`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Valid upload → storage → DB reference → public response', () => {
    test('uploads a valid PNG and persists a safe /images/ reference', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${productId}/images`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('image', TINY_PNG, { filename: 'user-controlled-name.png', contentType: 'image/png' });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);

      const image = res.body.data;
      expect(image.productId).toBe(productId);
      // Filename is server-generated (UUID), never the user-supplied name
      expect(image.imageUrl).toMatch(/^\/images\/[0-9a-f-]{36}\.png$/);
      expect(image.isPrimary).toBe(true); // first image becomes primary
      trackFile(image.imageUrl);

      // File exists on disk
      const onDisk = imageService.UPLOADS_DIR + path.sep + path.basename(image.imageUrl);
      expect(fs.existsSync(onDisk)).toBe(true);
      expect(fs.readFileSync(onDisk).equals(TINY_PNG)).toBe(true);
    });

    test('stored file is publicly served with the correct content type', async () => {
      const product = await prisma.productImage.findFirst({ where: { productId }, orderBy: { id: 'asc' } });
      const res = await request(app).get(product.imageUrl);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/png/);
    });

    test('public product response carries the uploaded image reference', async () => {
      const res = await request(app).get(`/api/products/${productId}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.images.length).toBe(1);
      expect(res.body.data.images[0].imageUrl).toMatch(/^\/images\//);
      expect(res.body.data.images[0].isPrimary).toBe(true);
    });

    test('denormalized Product.imageUrl is synced with the primary image', async () => {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      const firstImage = await prisma.productImage.findFirst({ where: { productId }, orderBy: { id: 'asc' } });
      expect(product.imageUrl).toBe(firstImage.imageUrl);
    });

    test('second upload is not primary; primary stays first (JPEG accepted)', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${productId}/images`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('image', TINY_JPEG, { filename: 'second.jpg', contentType: 'image/jpeg' });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.isPrimary).toBe(false);
      trackFile(res.body.data.imageUrl);
    });
  });

  describe('Removal & file cleanup', () => {
    test('delete removes the row, the file, and promotes the remaining primary', async () => {
      const images = await prisma.productImage.findMany({ where: { productId }, orderBy: { id: 'asc' } });
      expect(images.length).toBe(2);
      const primary = images.find((i) => i.isPrimary);
      const remaining = images.find((i) => !i.isPrimary);

      const res = await request(app)
        .delete(`/api/admin/catalog/products/${productId}/images/${primary.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(200);

      // Row gone
      expect(await prisma.productImage.findUnique({ where: { id: primary.id } })).toBeNull();
      // File deleted (was only referenced by the removed row)
      const file = imageService.UPLOADS_DIR + path.sep + path.basename(primary.imageUrl);
      expect(fs.existsSync(file)).toBe(false);
      // Remaining image promoted to primary; product.imageUrl synced
      const promoted = await prisma.productImage.findUnique({ where: { id: remaining.id } });
      expect(promoted.isPrimary).toBe(true);
      const product = await prisma.product.findUnique({ where: { id: productId } });
      expect(product.imageUrl).toBe(promoted.imageUrl);
    });

    test('file shared by another product reference is NOT deleted from disk', async () => {
      // Point another product's image row at the same file to simulate a shared reference
      const current = await prisma.productImage.findFirst({ where: { productId } });
      const otherProduct = await prisma.product.create({
        data: {
          categoryId,
          slug: 'image-ref-guard-' + Date.now(),
          priceUgx: 1000,
          translations: { create: { language: 'EN', name: 'Ref Guard' } },
        },
      });
      await prisma.productImage.create({
        data: { productId: otherProduct.id, imageUrl: current.imageUrl, isPrimary: false },
      });

      const res = await request(app)
        .delete(`/api/admin/catalog/products/${productId}/images/${current.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(200);

      // Row is gone but the FILE must remain (still referenced by otherProduct)
      const file = imageService.UPLOADS_DIR + path.sep + path.basename(current.imageUrl);
      expect(fs.existsSync(file)).toBe(true);
      trackFile(current.imageUrl); // ensure final cleanup

      await prisma.product.deleteMany({ where: { id: otherProduct.id } });
    });

    test('delete with a mismatched product/image pair returns 404', async () => {
      // Arbitrary (nonexistent) image ID against a nonexistent product: both mismatch paths return 404
      const res = await request(app)
        .delete('/api/admin/catalog/products/999999999/images/999999998')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Admin single-product endpoint (edit form load)', () => {
    test('GET /api/admin/catalog/products/:id returns full detail for ADMIN', async () => {
      const res = await request(app)
        .get(`/api/admin/catalog/products/${productId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(productId);
      expect(Array.isArray(res.body.data.translations)).toBe(true);
      expect(Array.isArray(res.body.data.images)).toBe(true);
      expect(res.body.data.category).toBeDefined();
    });

    test('GET single product by DISPATCHER is forbidden (403)', async () => {
      const res = await request(app)
        .get(`/api/admin/catalog/products/${productId}`)
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect(res.statusCode).toBe(403);
    });

    test('GET single product without token is rejected (401)', async () => {
      const res = await request(app).get(`/api/admin/catalog/products/${productId}`);
      expect(res.statusCode).toBe(401);
    });

    test('GET single product 404 for missing ID', async () => {
      const res = await request(app)
        .get('/api/admin/catalog/products/999999999')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(404);
    });
  });
});
