/**
 * Store settings, dashboard summary, order route map and the
 * general-merchandise catalogue (English-only input, brands, specs, facets).
 */
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signAdminToken } = require('../src/services/token.service');
const { createTestAddress } = require('./helpers/fixtures');

jest.setTimeout(60000);

describe('Admin operations', () => {
  let adminToken = null;
  let dispatcherToken = null;
  let originalDelivery = null;
  let originalCommitment = null;
  let category = null;
  const createdProductIds = [];
  const createdCategoryIds = [];
  const createdUserIds = [];
  const createdOrderIds = [];

  beforeAll(async () => {
    const login = await request(app).post('/api/admin/auth/login').send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    adminToken = login.body.data.token;
    const dispatcher = await prisma.admin.upsert({
      where: { email: 'dispatcher.ops@ugandafood.market' },
      update: { role: 'DISPATCHER', isActive: true },
      create: {
        fullName: 'Ops Dispatcher',
        email: 'dispatcher.ops@ugandafood.market',
        passwordHash: '$2a$12$eXampleHashedPasswordForTestOnly999999999999999999999999',
        role: 'DISPATCHER',
        isActive: true,
      },
    });
    dispatcherToken = signAdminToken(dispatcher);
    originalDelivery = await prisma.deliveryPricingConfig.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
    originalCommitment = await prisma.commitmentRuleConfig.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
    category = await prisma.category.findFirst();
  });

  afterAll(async () => {
    const d = originalDelivery;
    await prisma.deliveryPricingConfig.update({
      where: { id: d.id },
      data: {
        warehouseLat: d.warehouseLat, warehouseLng: d.warehouseLng, warehouseName: d.warehouseName,
        baseFeeUgx: d.baseFeeUgx, freeRadiusKm: d.freeRadiusKm, perKmRateUgx: d.perKmRateUgx,
        minimumFeeUgx: d.minimumFeeUgx, maxDeliveryKm: d.maxDeliveryKm,
      },
    });
    const c = originalCommitment;
    await prisma.commitmentRuleConfig.update({
      where: { id: c.id },
      data: { ruleType: c.ruleType, percentageValue: c.percentageValue, flatValueUgx: c.flatValueUgx, minCommitment: c.minCommitment },
    });
    for (const oid of createdOrderIds) {
      await prisma.adminNotification.deleteMany({ where: { orderId: oid } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
      await prisma.delivery.deleteMany({ where: { orderId: oid } });
      await prisma.orderItem.deleteMany({ where: { orderId: oid } });
      await prisma.order.deleteMany({ where: { id: oid } });
    }
    for (const pid of createdProductIds) {
      await prisma.cartItem.deleteMany({ where: { productId: pid } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: pid } });
      await prisma.productTranslation.deleteMany({ where: { productId: pid } });
      await prisma.productImage.deleteMany({ where: { productId: pid } });
      await prisma.product.deleteMany({ where: { id: pid } });
    }
    await prisma.categoryTranslation.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    for (const uid of createdUserIds) {
      await prisma.cartItem.deleteMany({ where: { cart: { userId: uid } } });
      await prisma.cart.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    await prisma.auditLog.deleteMany({ where: { action: { in: ['DELIVERY_SETTINGS_UPDATE', 'COMMITMENT_SETTINGS_UPDATE'] } } });
    await prisma.$disconnect();
  });

  describe('store settings', () => {
    test('all staff can read settings with tariff examples', async () => {
      const res = await request(app).get('/api/admin/settings').set('Authorization', `Bearer ${dispatcherToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.delivery.warehouseLat).toBeDefined();
      expect(res.body.data.examples).toHaveLength(5);
    });

    test('dispatchers cannot change settings; dispatch point must be in Uganda', async () => {
      const body = { warehouseName: 'Nakasero', warehouseLat: 0.3136, warehouseLng: 32.5811, baseFeeUgx: 3000, freeRadiusKm: 3, perKmRateUgx: 1200, minimumFeeUgx: 3000 };
      expect((await request(app).put('/api/admin/settings/delivery').set('Authorization', `Bearer ${dispatcherToken}`).send(body)).statusCode).toBe(403);
      const nairobi = await request(app).put('/api/admin/settings/delivery').set('Authorization', `Bearer ${adminToken}`).send({ ...body, warehouseLat: -1.29, warehouseLng: 36.82 });
      expect(nairobi.statusCode).toBe(422);
    });

    test('admin updates delivery tariff and deposit rule', async () => {
      const res = await request(app)
        .put('/api/admin/settings/delivery')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseName: 'Nakasero Market, Kampala', warehouseLat: 0.3136, warehouseLng: 32.5811, baseFeeUgx: 3500, freeRadiusKm: 2, perKmRateUgx: 1000, minimumFeeUgx: 3500, maxDeliveryKm: 80 });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.delivery).toMatchObject({ baseFeeUgx: 3500, freeRadiusKm: 2, maxDeliveryKm: 80, warehouseName: 'Nakasero Market, Kampala' });

      const dep = await request(app)
        .put('/api/admin/settings/commitment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ruleType: 'PERCENTAGE', percentageValue: 30, flatValueUgx: 10000, minCommitment: 5000 });
      expect(dep.statusCode).toBe(200);
    });
  });

  describe('dashboard & order map', () => {
    test('summary returns today, queues and a 7-day trend', async () => {
      const res = await request(app).get('/api/admin/dashboard/summary').set('Authorization', `Bearer ${dispatcherToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.trend).toHaveLength(7);
      expect(res.body.data.queues).toHaveProperty('unreadMessages');
      expect(res.body.data.queues).toHaveProperty('openServiceRequests');
    });

    test('order route returns distance, ETA, geometry and tariff comparison', async () => {
      const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
      const reg = await request(app).post('/api/auth/register').send({ fullName: 'Route Customer', phone, password: 'RoutePass123!' });
      const userId = reg.body.data.user.id;
      createdUserIds.push(userId);
      const token = (await request(app).post('/api/auth/login').send({ phone, password: 'RoutePass123!' })).body.data.token;
      const address = await createTestAddress(userId);
      const product = await prisma.product.create({
        data: { categoryId: category.id, slug: 'route-prod-' + Date.now(), priceUgx: 10000, stockQuantity: 5, isActive: true, nameEn: 'Route Product' },
      });
      createdProductIds.push(product.id);
      await request(app).post('/api/cart/items').set('Authorization', `Bearer ${token}`).send({ productId: product.id, quantity: 1 });
      const order = (await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send({ addressId: address.id })).body.data.order;
      createdOrderIds.push(order.id);

      const res = await request(app).get(`/api/admin/orders/${order.id}/route`).set('Authorization', `Bearer ${dispatcherToken}`);
      expect(res.statusCode).toBe(200);
      const r = res.body.data.route;
      expect(r.distanceKm).toBeGreaterThan(r.straightLineKm - 0.01);
      expect(r.etaMinutes).toBeGreaterThan(0);
      expect(r.geometry[0]).toEqual([0.3136, 32.5811]);
      expect(r.chargedFeeUgx).toBe(order.pricing.deliveryFeeUgx);
      expect(r.currentTariffFeeUgx).toBe(order.pricing.deliveryFeeUgx);

      const detail = await request(app).get(`/api/admin/orders/${order.id}`).set('Authorization', `Bearer ${dispatcherToken}`);
      expect(detail.body.data.order.fulfillment.distanceKm).toBeGreaterThan(0);
      expect(detail.body.data.order.customer.previousOrders).toBe(0);
    });
  });

  describe('general-merchandise catalogue', () => {
    test('category and product are created from English only, with brand/specs/compare-at', async () => {
      const cat = await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Test Phones ${Date.now()}`, icon: 'smartphone' });
      expect(cat.statusCode).toBe(201);
      createdCategoryIds.push(cat.body.data.id);
      expect(cat.body.data.icon).toBe('smartphone');
      expect(cat.body.data.slug).toMatch(/^test-phones-/);

      const res = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: cat.body.data.id,
          name: 'Tecno Spark 20 (128 GB)',
          description: 'Dual SIM smartphone',
          brand: 'Tecno',
          priceUgx: 550000,
          compareAtPriceUgx: 620000,
          stockQuantity: 7,
          isFeatured: true,
          specifications: [{ label: 'Storage', value: '128 GB' }, { label: 'RAM', value: '8 GB' }],
        });
      expect(res.statusCode).toBe(201);
      const p = res.body.data;
      createdProductIds.push(p.id);
      expect(p.slug).toBe('tecno-spark-20-128-gb');
      expect(p.brand).toBe('Tecno');
      expect(p.translations.find((t) => t.language === 'EN').name).toBe('Tecno Spark 20 (128 GB)');

      const pub = await request(app).get(`/api/products/${p.id}`);
      expect(pub.body.data).toMatchObject({ brand: 'Tecno', compareAtPrice: 620000, discountPercent: 11, isFeatured: true });
      expect(pub.body.data.specifications).toEqual([{ label: 'Storage', value: '128 GB' }, { label: 'RAM', value: '8 GB' }]);

      const facets = await request(app).get(`/api/products/facets?categorySlug=${cat.body.data.slug}`);
      expect(facets.body.data.brands).toEqual([{ name: 'Tecno', count: 1 }]);
      expect(facets.body.data.priceRange).toEqual({ min: 550000, max: 550000 });

      const byBrand = await request(app).get('/api/products?brand=tecno&sort=price_desc');
      expect(byBrand.body.data.some((x) => x.id === p.id)).toBe(true);
    });

    test('compare-at price must exceed the selling price; a name is required', async () => {
      const bad = await request(app)
        .post('/api/admin/catalog/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ categoryId: category.id, name: 'Cheap thing', priceUgx: 5000, compareAtPriceUgx: 4000 });
      expect(bad.statusCode).toBe(400);
      const noName = await request(app).post('/api/admin/catalog/products').set('Authorization', `Bearer ${adminToken}`).send({ categoryId: category.id, priceUgx: 5000 });
      expect(noName.statusCode).toBe(400);
    });

    test('retranslate reports clearly when translation is disabled', async () => {
      const res = await request(app).post(`/api/admin/catalog/products/${createdProductIds[createdProductIds.length - 1]}/translate`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(409);
      expect(res.body.message).toMatch(/disabled/);
    });
  });
});
