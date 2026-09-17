const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');

describe('Catalog Security & Validation Hardening (Phase 3 Security Review)', () => {
  let superAdminToken = null;
  let testCategoryId = null;
  let testProductId = null;

  beforeAll(async () => {
    const adminRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    superAdminToken = adminRes.body.data.token;
  });

  afterAll(async () => {
    if (testProductId) {
      await prisma.productImage.deleteMany({ where: { productId: testProductId } });
      await prisma.productTranslation.deleteMany({ where: { productId: testProductId } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: testProductId } });
      await prisma.product.deleteMany({ where: { id: testProductId } });
    }
    if (testCategoryId) {
      await prisma.categoryTranslation.deleteMany({ where: { categoryId: testCategoryId } });
      await prisma.category.deleteMany({ where: { id: testCategoryId } });
    }
    await prisma.$disconnect();
  });

  describe('Language Parameter Security', () => {
    test('rejects unsupported language values with 400 (no silent acceptance)', async () => {
      const res = await request(app).get('/api/products?lang=de');
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors || res.body.message)).toMatch(/language/i);
    });

    test('rejects malicious language payloads (SQL/XSS injection attempts)', async () => {
      const res1 = await request(app).get('/api/categories?lang=' + encodeURIComponent("' OR 1=1 --"));
      expect(res1.statusCode).toBe(400);

      const res2 = await request(app).get('/api/categories?lang=' + encodeURIComponent('<script>alert(1)</script>'));
      expect(res2.statusCode).toBe(400);
    });

    test('accepts all four supported languages case-insensitively', async () => {
      for (const lang of ['en', 'lg', 'fr', 'sw', 'EN', 'LG']) {
        const res = await request(app).get(`/api/categories?lang=${lang}`);
        expect(res.statusCode).toBe(200);
      }
    });
  });

  describe('Route Parameter Validation (IDOR / 500 prevention)', () => {
    test('GET /api/products/abc returns 400 instead of internal 500', async () => {
      const res = await request(app).get('/api/products/abc');
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('GET /api/products/-5 returns 400 for negative ID', async () => {
      const res = await request(app).get('/api/products/-5');
      expect(res.statusCode).toBe(400);
    });

    test('GET /api/products/1.5 returns 400 for non-integer ID', async () => {
      const res = await request(app).get('/api/products/1.5');
      expect(res.statusCode).toBe(400);
    });

    test('GET /api/categories/999999 returns 404 for valid-but-missing ID', async () => {
      const res = await request(app).get('/api/categories/999999');
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Image URL Path Safety', () => {
    beforeAll(async () => {
      const res = await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          slug: 'security-test-cat-' + Date.now(),
          translations: [{ language: 'en', name: 'Security Test Category' }],
        });
      testCategoryId = res.body.data.id;
    });

    test('rejects file:// protocol image URLs', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          categoryId: testCategoryId,
          slug: 'unsafe-file-proto-' + Date.now(),
          priceUgx: 1000,
          translations: [{ language: 'en', name: 'Unsafe' }],
          images: [{ imageUrl: 'file:///etc/passwd' }],
        });
      expect(res.statusCode).toBe(400);
    });

    test('rejects path traversal image URLs (../)', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          categoryId: testCategoryId,
          slug: 'unsafe-traversal-' + Date.now(),
          priceUgx: 1000,
          translations: [{ language: 'en', name: 'Unsafe' }],
          images: [{ imageUrl: '/images/../../.env' }],
        });
      expect(res.statusCode).toBe(400);
    });

    test('rejects javascript: protocol image URLs', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          categoryId: testCategoryId,
          slug: 'unsafe-js-proto-' + Date.now(),
          priceUgx: 1000,
          translations: [{ language: 'en', name: 'Unsafe' }],
          images: [{ imageUrl: 'javascript:alert(document.cookie)' }],
        });
      expect(res.statusCode).toBe(400);
    });

    test('rejects filesystem path image URLs', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          categoryId: testCategoryId,
          slug: 'unsafe-fs-path-' + Date.now(),
          priceUgx: 1000,
          translations: [{ language: 'en', name: 'Unsafe' }],
          images: [{ imageUrl: 'C:\\Users\\HP\\secrets\\db-creds.txt' }],
        });
      expect(res.statusCode).toBe(400);
    });

    test('accepts safe https image URL and safe relative /images/ path', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          categoryId: testCategoryId,
          slug: 'safe-image-product-' + Date.now(),
          priceUgx: 2500,
          stockQuantity: 5,
          translations: [{ language: 'en', name: 'Safe Image Product' }],
          images: [
            { imageUrl: 'https://images.example.ug/photo.jpg', isPrimary: true },
            { imageUrl: '/images/local-upload-123.webp' },
          ],
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.images.length).toBe(2);

      testProductId = res.body.data.id;
    });
  });

  describe('Inventory Authorization Deep Checks', () => {
    test('unauthenticated request to inventory history is rejected with 401', async () => {
      const res = await request(app).get(`/api/admin/catalog/products/${testProductId}/inventory/history`);
      expect(res.statusCode).toBe(401);
    });

    test('unauthenticated restock attempt is rejected with 401', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${testProductId}/inventory/restock`)
        .send({ quantity: 10 });
      expect(res.statusCode).toBe(401);
    });

    test('invalid restock payload (non-integer quantity) is rejected with 400', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${testProductId}/inventory/restock`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ quantity: 2.5 });
      expect(res.statusCode).toBe(400);
    });

    test('invalid adjustment payload (NaN quantityChange) is rejected with 400', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${testProductId}/inventory/adjust`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ quantityChange: 'abc' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Audit Log Integrity (no secrets leaked)', () => {
    test('recent audit logs contain no password hashes, OTP codes, or JWT secrets', async () => {
      const logs = await prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const sensitivePatterns = [/passwordHash/i, /password_hash/i, /\$2[aby]\$/, /codeHash/i, /jwt_secret/i, /JWT_SECRET/i];

      for (const log of logs) {
        const serialized = JSON.stringify(log);
        for (const pattern of sensitivePatterns) {
          expect(serialized).not.toMatch(pattern);
        }
      }
    });
  });
});
