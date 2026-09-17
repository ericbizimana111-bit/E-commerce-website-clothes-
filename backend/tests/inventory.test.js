const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const inventoryService = require('../src/services/inventory.service');
const { signAdminToken, signCustomerToken } = require('../src/services/token.service');

describe('Inventory Foundation & Concurrency Protection', () => {
  let superAdminToken = null;
  let dispatcherToken = null;
  let customerToken = null;
  let testProductId = null;

  let dispatcherAdminId = null;

  beforeAll(async () => {
    // 1. Admin login
    const adminRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    superAdminToken = adminRes.body.data.token;

    // 2. Real Dispatcher admin in database
    const dispatcher = await prisma.admin.upsert({
      where: { email: 'dispatcher.inventory@ugandafood.market' },
      update: { role: 'DISPATCHER', isActive: true },
      create: {
        fullName: 'Inventory Dispatcher',
        email: 'dispatcher.inventory@ugandafood.market',
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

    // 4. Create dedicated test product for inventory tests
    const category = await prisma.category.findFirst();
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'inventory-test-item-' + Date.now(),
        sku: 'UFM-INV-' + Date.now().toString().slice(-4),
        priceUgx: 10000,
        stockQuantity: 10,
        unit: 'box',
        imageUrl: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=600',
        isActive: true,
      },
    });
    testProductId = product.id;
  });

  afterAll(async () => {
    if (dispatcherAdminId) {
      await prisma.admin.deleteMany({ where: { id: dispatcherAdminId } });
    }
    if (testProductId) {
      await prisma.inventoryTransaction.deleteMany({ where: { productId: testProductId } });
      await prisma.product.deleteMany({ where: { id: testProductId } });
    }
  });

  describe('Administrative Restock Endpoint', () => {
    test('POST /inventory/restock increases stock and creates RESTOCK transaction', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${testProductId}/inventory/restock`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          quantity: 25,
          reason: 'Supplier weekly delivery',
          referenceId: 'PO-2026-001',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.stockQuantity).toBe(35); // 10 initial + 25
      expect(res.body.data.transaction.type).toBe('RESTOCK');
      expect(res.body.data.transaction.quantityChange).toBe(25);
      expect(res.body.data.transaction.previousQuantity).toBe(10);
      expect(res.body.data.transaction.newQuantity).toBe(35);
    });

    test('POST /inventory/restock rejects 0 or negative restock quantity', async () => {
      const res0 = await request(app)
        .post(`/api/admin/catalog/products/${testProductId}/inventory/restock`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ quantity: 0 });
      expect(res0.statusCode).toBe(400);

      const resNeg = await request(app)
        .post(`/api/admin/catalog/products/${testProductId}/inventory/restock`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ quantity: -10 });
      expect(resNeg.statusCode).toBe(400);
    });
  });

  describe('Administrative Stock Adjustment Endpoint', () => {
    test('POST /inventory/adjust can decrease stock safely', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${testProductId}/inventory/adjust`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          quantityChange: -5,
          reason: 'Damaged packaging written off',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.product.stockQuantity).toBe(30); // 35 - 5
      expect(res.body.data.transaction.type).toBe('ADJUSTMENT');
      expect(res.body.data.transaction.quantityChange).toBe(-5);
    });

    test('POST /inventory/adjust rejects change that would cause negative stock (Invariant: stock >= 0)', async () => {
      // Current stock is 30, attempting to decrease by 50
      const res = await request(app)
        .post(`/api/admin/catalog/products/${testProductId}/inventory/adjust`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          quantityChange: -50,
          reason: 'Attempted excessive reduction',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Insufficient stock');

      // Verify stock in database remains exactly 30
      const check = await prisma.product.findUnique({ where: { id: testProductId } });
      expect(check.stockQuantity).toBe(30);
    });
  });

  describe('Inventory History & Availability Check', () => {
    test('GET /inventory/history returns chronological paginated audit trail', async () => {
      const res = await request(app)
        .get(`/api/admin/catalog/products/${testProductId}/inventory/history`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2); // Restock + Adjust
      expect(res.body.pagination).toBeDefined();
    });

    test('GET /inventory/check verifies available stock without mutation', async () => {
      const res = await request(app)
        .get(`/api/admin/catalog/products/${testProductId}/inventory/check?quantity=20`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.stockQuantity).toBe(30);
      expect(res.body.data.isAvailable).toBe(true);

      const resExcess = await request(app)
        .get(`/api/admin/catalog/products/${testProductId}/inventory/check?quantity=50`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(resExcess.body.data.isAvailable).toBe(false);
    });
  });

  describe('Concurrency Protection Test', () => {
    test('concurrent stock decrements cannot violate non-negative stock invariant', async () => {
      // Create a low-stock test item with exact stock of 5
      const category = await prisma.category.findFirst();
      const lowStockItem = await prisma.product.create({
        data: {
          categoryId: category.id,
          slug: 'concurrency-race-item-' + Date.now(),
          priceUgx: 5000,
          stockQuantity: 5,
          unit: 'unit',
          imageUrl: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=600',
          isActive: true,
        },
      });

      // Launch 5 parallel requests each trying to purchase/consume 2 units (total attempted: 10 units on stock of 5)
      // Exactly 2 requests of 2 units should succeed (consuming 4 units, leaving 1 unit)
      // The remaining 3 requests must be rejected with 400 Insufficient stock
      const results = await Promise.allSettled([
        inventoryService.applyStockChange({ productId: lowStockItem.id, quantityChange: -2, type: 'SALE' }),
        inventoryService.applyStockChange({ productId: lowStockItem.id, quantityChange: -2, type: 'SALE' }),
        inventoryService.applyStockChange({ productId: lowStockItem.id, quantityChange: -2, type: 'SALE' }),
        inventoryService.applyStockChange({ productId: lowStockItem.id, quantityChange: -2, type: 'SALE' }),
        inventoryService.applyStockChange({ productId: lowStockItem.id, quantityChange: -2, type: 'SALE' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(2); // Exactly 4 units consumed
      expect(rejected.length).toBe(3); // 3 attempts failed due to insufficient stock

      // Check final DB state: remaining stock must be exactly 1
      const finalDbProduct = await prisma.product.findUnique({ where: { id: lowStockItem.id } });
      expect(finalDbProduct.stockQuantity).toBe(1);
      expect(finalDbProduct.stockQuantity).toBeGreaterThanOrEqual(0);

      // Clean up concurrency test product
      await prisma.inventoryTransaction.deleteMany({ where: { productId: lowStockItem.id } });
      await prisma.product.deleteMany({ where: { id: lowStockItem.id } });
    });
  });

  describe('Inventory RBAC & Authorization', () => {
    test('rejects inventory mutation from DISPATCHER (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${testProductId}/inventory/restock`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ quantity: 10 });

      expect(res.statusCode).toBe(403);
    });

    test('rejects inventory mutation from CUSTOMER (401 Unauthorized)', async () => {
      const res = await request(app)
        .post(`/api/admin/catalog/products/${testProductId}/inventory/restock`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ quantity: 10 });

      expect(res.statusCode).toBe(401);
    });
  });
});
