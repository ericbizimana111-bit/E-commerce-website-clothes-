const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signAdminToken, signCustomerToken } = require('../src/services/token.service');

describe('Multilingual Food Catalog & Admin Management', () => {
  let superAdminToken = null;
  let dispatcherToken = null;
  let customerToken = null;

  let createdCategoryId = null;
  let createdProductId = null;

  let dispatcherAdminId = null;

  beforeAll(async () => {
    // 1. Admin login (SUPER_ADMIN)
    const adminRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    superAdminToken = adminRes.body.data.token;

    // 2. Real Dispatcher admin record in database
    const dispatcher = await prisma.admin.upsert({
      where: { email: 'dispatcher.catalog@ugandafood.market' },
      update: { role: 'DISPATCHER', isActive: true },
      create: {
        fullName: 'Test Dispatcher',
        email: 'dispatcher.catalog@ugandafood.market',
        passwordHash: '$2a$12$eXampleHashedPasswordForTestOnly999999999999999999999999',
        role: 'DISPATCHER',
        isActive: true,
      },
    });
    dispatcherAdminId = dispatcher.id;
    dispatcherToken = signAdminToken(dispatcher);

    // 3. Customer token
    customerToken = signCustomerToken({
      id: '00000000-0000-0000-0000-000000000088',
      phone: '+256770000000',
    });
  });

  afterAll(async () => {
    // Clean up test entities created during test suite
    if (dispatcherAdminId) {
      await prisma.admin.deleteMany({ where: { id: dispatcherAdminId } });
    }
    if (createdProductId) {
      await prisma.productImage.deleteMany({ where: { productId: createdProductId } });
      await prisma.productTranslation.deleteMany({ where: { productId: createdProductId } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: createdProductId } });
      await prisma.product.deleteMany({ where: { id: createdProductId } });
    }

    if (createdCategoryId) {
      await prisma.categoryTranslation.deleteMany({ where: { categoryId: createdCategoryId } });
      await prisma.category.deleteMany({ where: { id: createdCategoryId } });
    }
  });

  describe('Public Category Endpoints & Translations', () => {
    test('GET /api/categories returns active categories in English by default', async () => {
      const res = await request(app).get('/api/categories');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const matooke = res.body.data.find((c) => c.slug === 'matooke-tubers');
      expect(matooke).toBeDefined();
      expect(matooke.name).toBe('Matooke & Tubers');
      expect(matooke.language).toBe('EN');
      expect(matooke.productCount).toBeGreaterThan(0);
    });

    test('GET /api/categories?lang=lg returns Luganda translations', async () => {
      const res = await request(app).get('/api/categories?lang=lg');

      expect(res.statusCode).toBe(200);
      const matooke = res.body.data.find((c) => c.slug === 'matooke-tubers');
      expect(matooke).toBeDefined();
      expect(matooke.name).toBe("Amatooke n'Ebinnya");
      expect(matooke.language).toBe('LG');
    });

    test('GET /api/categories?lang=fr returns French translations', async () => {
      const res = await request(app).get('/api/categories?lang=fr');

      expect(res.statusCode).toBe(200);
      const matooke = res.body.data.find((c) => c.slug === 'matooke-tubers');
      expect(matooke).toBeDefined();
      expect(matooke.name).toBe('Matooke et Tubercules');
      expect(matooke.language).toBe('FR');
    });

    test('GET /api/categories?lang=sw returns Kiswahili translations', async () => {
      const res = await request(app).get('/api/categories?lang=sw');

      expect(res.statusCode).toBe(200);
      const matooke = res.body.data.find((c) => c.slug === 'matooke-tubers');
      expect(matooke).toBeDefined();
      expect(matooke.name).toBe('Ndizi na Mizizi');
      expect(matooke.language).toBe('SW');
    });

    test('GET /api/categories/slug/:slug returns single category with translation', async () => {
      const res = await request(app).get('/api/categories/slug/fresh-fruits?lang=lg');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('fresh-fruits');
      expect(res.body.data.name).toBe('Ebibala Ebibisi');
    });
  });

  describe('Admin Category Management & RBAC', () => {
    test('POST /api/admin/catalog/categories creates category with translations (SUPER_ADMIN)', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          slug: 'bakery-snacks-test',
          displayOrder: 10,
          isActive: true,
          translations: [
            { language: 'en', name: 'Bakery & Snacks', description: 'Freshly baked mandazi, dabo kolo and samosas' },
            { language: 'lg', name: 'Emigaati n’Eby’okulya', description: 'Ammandazi n’ebisiike ebisiikiddwa obulungi' },
            { language: 'fr', name: 'Boulangerie et Collations', description: 'Beignets et collations traditionnelles' },
            { language: 'sw', name: 'Mikate na Vitafunwa', description: 'Mandazi safi na samosa tamu' },
          ],
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.translations.length).toBe(4);

      createdCategoryId = res.body.data.id;
    });

    test('POST /api/admin/catalog/categories rejects duplicate slug', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          slug: 'bakery-snacks-test',
          translations: [{ language: 'en', name: 'Duplicate Category' }],
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
    });

    test('PUT /api/admin/catalog/categories/:id updates category details and translations', async () => {
      const res = await request(app)
        .put(`/api/admin/catalog/categories/${createdCategoryId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          displayOrder: 15,
          translations: [
            { language: 'en', name: 'Bakery, Pastries & Snacks' },
          ],
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.displayOrder).toBe(15);
    });

    test('PATCH /api/admin/catalog/categories/:id/active deactivates category (hides from public listing)', async () => {
      // 1. Deactivate
      const patchRes = await request(app)
        .patch(`/api/admin/catalog/categories/${createdCategoryId}/active`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isActive: false });

      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.body.data.isActive).toBe(false);

      // 2. Verify hidden from public GET /api/categories
      const pubRes = await request(app).get('/api/categories');
      const found = pubRes.body.data.find((c) => c.id === createdCategoryId);
      expect(found).toBeUndefined();

      // 3. Reactivate for subsequent tests
      await request(app)
        .patch(`/api/admin/catalog/categories/${createdCategoryId}/active`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isActive: true });
    });

    test('rejects category mutation when called by DISPATCHER (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          slug: 'unauthorized-cat',
          translations: [{ language: 'en', name: 'Unauthorized' }],
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('rejects category mutation when called by CUSTOMER (401 Context Isolation)', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          slug: 'customer-tamper',
          translations: [{ language: 'en', name: 'Customer' }],
        });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('Public Product Endpoints, Search, Filters & Pagination', () => {
    test('GET /api/products returns paginated public catalog', async () => {
      const res = await request(app).get('/api/products?page=1&limit=5');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.pagination.total).toBeGreaterThan(0);

      const product = res.body.data[0];
      expect(product.currency).toBe('UGX');
      expect(typeof product.price).toBe('number');
      expect(product.availability).toBeDefined();
      expect(typeof product.availability.inStock).toBe('boolean');
    });

    test('GET /api/products?search=Matooke searches across translated names', async () => {
      const res = await request(app).get('/api/products?search=Matooke');

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.some((p) => p.slug.includes('matooke'))).toBe(true);
    });

    test('GET /api/products?categorySlug=matooke-tubers filters by category slug', async () => {
      const res = await request(app).get('/api/products?categorySlug=matooke-tubers');

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const prod of res.body.data) {
        expect(prod.category.slug).toBe('matooke-tubers');
      }
    });

    test('GET /api/products?minPrice=4000&maxPrice=7000 filters by integer UGX price range', async () => {
      const res = await request(app).get('/api/products?minPrice=4000&maxPrice=7000');

      expect(res.statusCode).toBe(200);
      for (const prod of res.body.data) {
        expect(prod.price).toBeGreaterThanOrEqual(4000);
        expect(prod.price).toBeLessThanOrEqual(7000);
      }
    });

    test('GET /api/products?inStock=true returns only available stock items', async () => {
      const res = await request(app).get('/api/products?inStock=true');

      expect(res.statusCode).toBe(200);
      for (const prod of res.body.data) {
        expect(prod.availability.inStock).toBe(true);
        expect(prod.availability.stockQuantity).toBeGreaterThan(0);
      }
    });

    test('GET /api/products/slug/:slug returns single localized product', async () => {
      const res = await request(app).get('/api/products/slug/fresh-green-matooke-cluster?lang=sw');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Ndizi Mbichi Safi (Tawi)');
      expect(res.body.data.language).toBe('SW');
      expect(res.body.data.currency).toBe('UGX');
      expect(res.body.data.price).toBe(28000);
    });
  });

  describe('Admin Product Management & RBAC', () => {
    test('POST /api/admin/catalog/products creates a product with 4 translations, initial stock, and images', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          categoryId: createdCategoryId,
          slug: 'mandazi-golden-pack',
          sku: 'UFM-MNDZ-001',
          priceUgx: 3500,
          stockQuantity: 50,
          unit: 'pack of 4',
          isActive: true,
          translations: [
            { language: 'en', name: 'Golden Crispy Mandazi (Pack of 4)', description: 'Delicious golden fried East African donuts flavored with cardamom.' },
            { language: 'lg', name: 'Ammandazi Amasiike Obulungi', description: 'Ammandazi agawunya obulungi akazigo n’ebinzaali.' },
            { language: 'fr', name: 'Mandazi Croustillants Dorés', description: 'Délicieux beignets est-africains à la cardamome.' },
            { language: 'sw', name: 'Mandazi ya Kukaanga ya Dhahabu', description: 'Mandazi laini ya iliki yaliyokaangwa vizuri.' },
          ],
          images: [
            {
              imageUrl: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=600',
              altText: 'Mandazi Pack',
              isPrimary: true,
              sortOrder: 0,
            },
          ],
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.stockQuantity).toBe(50);
      expect(res.body.data.translations.length).toBe(4);
      expect(res.body.data.images.length).toBe(1);

      createdProductId = res.body.data.id;

      // Verify INITIAL_STOCK transaction was recorded
      const tx = await prisma.inventoryTransaction.findFirst({
        where: { productId: createdProductId, type: 'INITIAL_STOCK' },
      });
      expect(tx).toBeDefined();
      expect(tx.newQuantity).toBe(50);
    });

    test('POST /api/admin/catalog/products rejects negative price (UGX)', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          categoryId: createdCategoryId,
          slug: 'invalid-price-item',
          priceUgx: -500,
          translations: [{ language: 'en', name: 'Invalid' }],
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('POST /api/admin/catalog/products rejects nonexistent category', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          categoryId: 999999,
          slug: 'orphan-item',
          priceUgx: 5000,
          translations: [{ language: 'en', name: 'Orphan' }],
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('does not exist');
    });

    test('PUT /api/admin/catalog/products/:id updates product details', async () => {
      const res = await request(app)
        .put(`/api/admin/catalog/products/${createdProductId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          priceUgx: 4000,
          unit: 'pack of 5',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.priceUgx).toBe(4000);
      expect(res.body.data.unit).toBe('pack of 5');
    });

    test('PATCH /api/admin/catalog/products/:id/active deactivates product (hides from public)', async () => {
      // 1. Deactivate
      const patchRes = await request(app)
        .patch(`/api/admin/catalog/products/${createdProductId}/active`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isActive: false });

      expect(patchRes.statusCode).toBe(200);

      // 2. Public product by slug must return 404
      const pubRes = await request(app).get('/api/products/slug/mandazi-golden-pack');
      expect(pubRes.statusCode).toBe(404);

      // 3. Reactivate
      await request(app)
        .patch(`/api/admin/catalog/products/${createdProductId}/active`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isActive: true });
    });

    test('PUT /api/admin/catalog/products/:id/images replaces images list', async () => {
      const res = await request(app)
        .put(`/api/admin/catalog/products/${createdProductId}/images`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          images: [
            { imageUrl: 'https://example.ug/img1.jpg', altText: 'Front Image', isPrimary: true },
            { imageUrl: 'https://example.ug/img2.jpg', altText: 'Detail Image', isPrimary: false },
          ],
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.images.length).toBe(2);
    });

    test('rejects product mutation when called by DISPATCHER (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          categoryId: createdCategoryId,
          slug: 'dispatcher-tamper-prod',
          priceUgx: 1000,
          translations: [{ language: 'en', name: 'Tamper' }],
        });

      expect(res.statusCode).toBe(403);
    });
  });
});
