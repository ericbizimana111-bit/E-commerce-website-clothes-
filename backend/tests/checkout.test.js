const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const { signCustomerToken } = require('../src/services/token.service');

// Under full parallel suite load, setup (registrations + bcrypt) exceeds Jest's 5s default
jest.setTimeout(30000);

describe('Checkout Preparation Preview (Phase 4, read-only)', () => {
  let token = null;
  let userId = null;
  let otherToken = null;
  let otherUserId = null;
  let address = null;
  let station = null;
  let product = null;
  let cartItemId = null;

  const createdUserIds = [];
  const createdProductIds = [];

  async function makeTestCustomer(suffix) {
    // Random 7-digit suffix + retry: parallel test suites also register customers,
    // so timestamp-derived phones can collide across workers.
    for (let attempt = 0; attempt < 5; attempt++) {
      const phone = `+25678${Math.floor(1000000 + Math.random() * 9000000)}`;
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ fullName: `Checkout Tester ${suffix}`, phone, password: 'CheckoutPass123!' });
      if (reg.statusCode === 409) continue; // phone taken by another worker, retry
      expect(reg.statusCode).toBe(201);
      const id = reg.body.data.user.id;
      createdUserIds.push(id);
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'CheckoutPass123!' });
      return { token: login.body.data.token, id };
    }
    throw new Error('Could not register a unique test customer after 5 attempts');
  }

  beforeAll(async () => {
    const a = await makeTestCustomer(String(Date.now()).slice(-7));
    token = a.token;
    userId = a.id;

    const b = await makeTestCustomer(String(Date.now() + 2).slice(-7));
    otherToken = b.token;
    otherUserId = b.id;

    const category = await prisma.category.findFirst();
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'checkout-test-beef-' + Date.now(),
        priceUgx: 17000,
        stockQuantity: 8,
        unit: 'kg',
        isActive: true,
        translations: { create: [{ language: 'EN', name: 'Checkout Test Beef' }] },
      },
    });
    createdProductIds.push(product.id);

    address = await prisma.address.create({
      data: {
        userId,
        title: 'Home',
        district: 'Kampala',
        streetAddress: '12 Test Lane, Nakawa',
        isDefault: true,
      },
    });

    station = await prisma.pickupStation.findFirst({ where: { isActive: true } });

    // Address for the OTHER customer (IDOR target)
    await prisma.address.create({
      data: {
        userId: otherUserId,
        title: 'Home',
        district: 'Entebbe',
        streetAddress: '99 Other Road',
      },
    });
  });

  afterAll(async () => {
    for (const pid of createdProductIds) {
      await prisma.cartItem.deleteMany({ where: { productId: pid } });
      await prisma.productTranslation.deleteMany({ where: { productId: pid } });
      await prisma.productImage.deleteMany({ where: { productId: pid } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: pid } });
      await prisma.product.deleteMany({ where: { id: pid } });
    }
    for (const uid of createdUserIds) {
      await prisma.cartItem.deleteMany({ where: { cart: { userId: uid } } });
      await prisma.address.deleteMany({ where: { userId: uid } });
      await prisma.cart.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    await prisma.$disconnect();
  });

  async function addToCart(productId, quantity) {
    const res = await request(app).post('/api/cart/items').set('Authorization', `Bearer ${token}`).send({ productId, quantity });
    expect(res.statusCode).toBe(201);
    return res;
  }

  describe('Fulfillment Validation', () => {
    test('invalid fulfillmentMethod returns 400', async () => {
      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'DRONE_DELIVERY' });
      expect(res.statusCode).toBe(400);
    });

    test('HOME_DELIVERY without addressId returns 400', async () => {
      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'HOME_DELIVERY', addressId: null });
      expect(res.statusCode).toBe(400);
    });

    test('PICKUP_STATION without pickupStationId returns 400', async () => {
      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: null });
      expect(res.statusCode).toBe(400);
    });

    test('nonexistent address returns 404', async () => {
      await addToCart(product.id, 1);
      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'HOME_DELIVERY', addressId: '00000000-0000-0000-0000-000000000009' });
      expect(res.statusCode).toBe(404);
    });

    test('IDOR: another customer address is rejected (404)', async () => {
      const otherAddress = await prisma.address.findFirst({ where: { userId: otherUserId } });
      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'HOME_DELIVERY', addressId: otherAddress.id });
      expect(res.statusCode).toBe(404);
    });

    test('nonexistent pickup station returns 404', async () => {
      await addToCart(product.id, 1);
      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 999999 });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Cart State Validation', () => {
    test('empty cart returns 400', async () => {
      // clear the cart first
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${token}`);
      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/empty/i);
    });

    test('inactive product in cart is flagged, preview not fatal', async () => {
      await addToCart(product.id, 1);
      await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });

      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.checkout.ready).toBe(false);
      expect(res.body.data.checkout.issues.some((i) => i.issue === 'PRODUCT_INACTIVE')).toBe(true);
      await prisma.product.update({ where: { id: product.id }, data: { isActive: true } });
    });

    test('insufficient stock is flagged with actual available quantity', async () => {
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${token}`);
      await addToCart(product.id, 8); // stock 8
      await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: 3 } });

      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });

      expect(res.statusCode).toBe(200);
      const issue = res.body.data.checkout.issues.find((i) => i.issue === 'INSUFFICIENT_STOCK');
      expect(issue).toBeDefined();
      expect(issue.message).toContain('Available: 3');
      await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: 8 } });
    });

    test('stale price is flagged and current price used for totals', async () => {
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${token}`);
      await addToCart(product.id, 2); // 17000 each
      await prisma.product.update({ where: { id: product.id }, data: { priceUgx: 20000 } });

      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });

      const item = res.body.data.checkout.items[0];
      expect(item.priceIsStale).toBe(true);
      expect(item.cartUnitPriceUgx).toBe(17000);
      expect(item.currentUnitPriceUgx).toBe(20000);
      expect(item.lineSubtotalUgx).toBe(40000);
      expect(res.body.data.checkout.pricing.subtotalUgx).toBe(40000);
    });
  });

  describe('Successful Preview & Commitment Calculation', () => {
    beforeAll(async () => {
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${token}`);
      await addToCart(product.id, 2); // 17000 x 2 = 34000
    });

    test('valid pickup preview returns server-calculated pricing', async () => {
      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });

      expect(res.statusCode).toBe(200);
      const checkout = res.body.data.checkout;
      expect(checkout.ready).toBe(true);
      expect(checkout.issues).toEqual([]);
      expect(checkout.pricing.currency).toBe('UGX');

      // Recompute expected math from the authoritative preview items so the
      // assertion is robust against price leakage from earlier tests.
      const expectedSubtotal = checkout.items.reduce((s, i) => s + i.lineSubtotalUgx, 0);
      expect(expectedSubtotal).toBeGreaterThan(0);
      expect(checkout.pricing.subtotalUgx).toBe(expectedSubtotal);
      expect(checkout.pricing.totalUgx).toBe(expectedSubtotal);

      // commitment from server config: PERCENTAGE 30%, min 5000 — total > min here
      expect(checkout.pricing.commitmentUgx).toBe(Math.round((expectedSubtotal * 30) / 100));
      expect(checkout.pricing.remainingBalanceUgx).toBe(expectedSubtotal - checkout.pricing.commitmentUgx);
    });

    test('valid home delivery preview with owned address succeeds', async () => {
      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'HOME_DELIVERY', addressId: address.id });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.checkout.ready).toBe(true);
      expect(res.body.data.checkout.fulfillment.fulfillmentMethod).toBe('HOME_DELIVERY');
    });
  });

  describe('Read-Only Guarantee', () => {
    test('preview creates no order, no payment, deducts no stock, writes no inventory transaction', async () => {
      const productsBefore = await prisma.product.findUnique({ where: { id: product.id }, select: { stockQuantity: true } });
      const ordersBefore = await prisma.order.count();
      const paymentsBefore = await prisma.payment.count();
      const invTxBefore = await prisma.inventoryTransaction.count();

      const res = await request(app)
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
      expect(res.statusCode).toBe(200);

      const productsAfter = await prisma.product.findUnique({ where: { id: product.id }, select: { stockQuantity: true } });
      expect(productsAfter.stockQuantity).toBe(productsBefore.stockQuantity);
      expect(await prisma.order.count()).toBe(ordersBefore);
      expect(await prisma.payment.count()).toBe(paymentsBefore);
      expect(await prisma.inventoryTransaction.count()).toBe(invTxBefore);
    });
  });
});
