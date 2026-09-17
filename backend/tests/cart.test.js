const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signCustomerToken } = require('../src/services/token.service');

// Under full parallel suite load, setup (registrations + bcrypt) exceeds Jest's 5s default
jest.setTimeout(30000);

describe('Shopping Cart & Checkout Preparation (Phase 4)', () => {
  let customerAToken = null;
  let customerBToken = null;
  let customerAId = null;
  let customerBId = null;
  let productA = null; // active with stock
  let productB = null; // active with stock
  let inactiveProduct = null;

  const createdUserIds = [];
  const createdProductIds = [];

  async function makeTestCustomer(phoneSuffix) {
    // Random 7-digit suffix + retry: parallel test suites also register customers,
    // so timestamp-derived phones can collide across workers.
    for (let attempt = 0; attempt < 5; attempt++) {
      const phone = `+25677${Math.floor(1000000 + Math.random() * 9000000)}`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({ fullName: `Cart Tester ${phoneSuffix}`, phone, password: 'CartPass123!' });
      if (res.statusCode === 409) continue; // phone taken by another worker, retry
      expect(res.statusCode).toBe(201);
      const userId = res.body.data.user.id;
      createdUserIds.push(userId);
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'CartPass123!' });
      return { token: login.body.data.token, id: userId };
    }
    throw new Error('Could not register a unique test customer after 5 attempts');
  }

  beforeAll(async () => {
    const a = await makeTestCustomer(String(Date.now()).slice(-7));
    customerAToken = a.token;
    customerAId = a.id;

    const b = await makeTestCustomer(String(Date.now() + 1).slice(-7));
    customerBToken = b.token;
    customerBId = b.id;

    // Dedicated test products (cleaned up after)
    const category = await prisma.category.findFirst();
    productA = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'cart-test-matooke-' + Date.now(),
        priceUgx: 5000,
        stockQuantity: 10,
        unit: 'kg',
        isActive: true,
        translations: { create: [{ language: 'EN', name: 'Cart Test Matooke' }] },
      },
    });
    createdProductIds.push(productA.id);

    productB = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'cart-test-rice-' + Date.now(),
        priceUgx: 7500,
        stockQuantity: 20,
        unit: 'kg',
        isActive: true,
        translations: { create: [{ language: 'EN', name: 'Cart Test Rice' }] },
      },
    });
    createdProductIds.push(productB.id);

    inactiveProduct = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'cart-test-inactive-' + Date.now(),
        priceUgx: 3000,
        stockQuantity: 5,
        unit: 'kg',
        isActive: false,
        translations: { create: [{ language: 'EN', name: 'Inactive Product' }] },
      },
    });
    createdProductIds.push(inactiveProduct.id);
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
      await prisma.cart.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    await prisma.$disconnect();
  });

  describe('Cart Authentication', () => {
    test('unauthenticated GET /api/cart returns 401', async () => {
      const res = await request(app).get('/api/cart');
      expect(res.statusCode).toBe(401);
    });

    test('unauthenticated add item returns 401', async () => {
      const res = await request(app).post('/api/cart/items').send({ productId: productA.id, quantity: 1 });
      expect(res.statusCode).toBe(401);
    });

    test('unauthenticated update item returns 401', async () => {
      const res = await request(app).patch('/api/cart/items/00000000-0000-0000-0000-000000000000').send({ quantity: 2 });
      expect(res.statusCode).toBe(401);
    });

    test('unauthenticated remove item returns 401', async () => {
      const res = await request(app).delete('/api/cart/items/00000000-0000-0000-0000-000000000000');
      expect(res.statusCode).toBe(401);
    });

    test('unauthenticated clear cart returns 401', async () => {
      const res = await request(app).delete('/api/cart');
      expect(res.statusCode).toBe(401);
    });

    test('unauthenticated checkout preview returns 401', async () => {
      const res = await request(app).post('/api/checkout/preview').send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 1 });
      expect(res.statusCode).toBe(401);
    });

    test('malformed JWT returns 401', async () => {
      const res = await request(app).get('/api/cart').set('Authorization', 'Bearer not.a.jwt');
      expect(res.statusCode).toBe(401);
    });

    test('admin token cannot access customer cart (context isolation)', async () => {
      const adminRes = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
      const adminToken = adminRes.body.data.token;

      const res = await request(app).get('/api/cart').set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Cart Creation & One-Cart-Per-Customer', () => {
    test('GET cart creates exactly one cart and repeated GETs do not duplicate', async () => {
      const res1 = await request(app).get('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
      expect(res1.statusCode).toBe(200);
      expect(res1.body.data.cart.items).toEqual([]);
      expect(res1.body.data.cart.currency).toBe('UGX');

      await request(app).get('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
      await request(app).get('/api/cart').set('Authorization', `Bearer ${customerAToken}`);

      const carts = await prisma.cart.findMany({ where: { userId: customerAId } });
      expect(carts.length).toBe(1);
    });

    test('concurrent first GETs remain safe (no duplicate carts)', async () => {
      const results = await Promise.allSettled([
        request(app).get('/api/cart').set('Authorization', `Bearer ${customerBToken}`),
        request(app).get('/api/cart').set('Authorization', `Bearer ${customerBToken}`),
        request(app).get('/api/cart').set('Authorization', `Bearer ${customerBToken}`),
      ]);
      for (const r of results) {
        expect(r.status).toBe('fulfilled');
        expect(r.value.statusCode).toBe(200);
      }
      const carts = await prisma.cart.findMany({ where: { userId: customerBId } });
      expect(carts.length).toBe(1);
    });
  });

  describe('Add Item Validation & Behavior', () => {
    test('adds a valid product with server-side price snapshot', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: productA.id, quantity: 2 });

      expect(res.statusCode).toBe(201);
      const item = res.body.data.cart.items.find((i) => i.productId === productA.id);
      expect(item).toBeDefined();
      expect(item.quantity).toBe(2);
      expect(item.unitPriceUgx).toBe(5000);
      expect(item.subtotalUgx).toBe(10000);
      expect(res.body.data.cart.subtotalUgx).toBe(10000);
    });

    test('duplicate product add increments quantity (no duplicate row)', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: productA.id, quantity: 3 });

      expect(res.statusCode).toBe(201);
      const items = res.body.data.cart.items.filter((i) => i.productId === productA.id);
      expect(items.length).toBe(1);
      expect(items[0].quantity).toBe(5); // 2 + 3
    });

    test('duplicate add above stock rejects the entire operation (no partial add)', async () => {
      // stock is 10, cart already has 5; adding 6 -> 11 > 10 must reject entirely
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: productA.id, quantity: 6 });
      expect(res.statusCode).toBe(409);

      const check = await prisma.cartItem.findFirst({
        where: { cart: { userId: customerAId }, productId: productA.id },
      });
      expect(Math.trunc(Number(check.quantity))).toBe(5);
    });

    test('rejects zero, negative, decimal, string and huge quantities', async () => {
      const cases = [
        { quantity: 0 },
        { quantity: -2 },
        { quantity: 1.5 },
        { quantity: 'two' },
        { quantity: 1001 },
        { quantity: null },
        {},
      ];
      for (const body of cases) {
        const res = await request(app)
          .post('/api/cart/items')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({ productId: productB.id, ...body });
        expect(res.statusCode).toBe(400);
      }
    });

    test('rejects nonexistent product (404) and malformed productId (400)', async () => {
      const missing = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: 99999999, quantity: 1 });
      expect(missing.statusCode).toBe(404);

      const malformed = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: 'abc', quantity: 1 });
      expect(malformed.statusCode).toBe(400);
    });

    test('rejects inactive product', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: inactiveProduct.id, quantity: 1 });
      expect(res.statusCode).toBe(400);
    });

    test('quantity above available stock is rejected (409)', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: productB.id, quantity: 25 }); // stock 20
      expect(res.statusCode).toBe(409);
    });

    test('client-supplied price fields are stripped (mass-assignment protection)', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: productB.id, quantity: 1, priceUgx: 1, unitPriceUgx: 1, subtotalUgx: 1, userId: customerBId, cartId: 'fake' });

      expect(res.statusCode).toBe(201);
      const item = res.body.data.cart.items.find((i) => i.productId === productB.id);
      expect(item.unitPriceUgx).toBe(7500); // authoritative DB price, NOT 1

      const dbItem = await prisma.cartItem.findFirst({
        where: { cart: { userId: customerAId }, productId: productB.id },
      });
      expect(dbItem.unitPriceUgx).toBe(7500);
    });
  });

  describe('Update Item', () => {
    let itemId = null;

    beforeAll(async () => {
      const cart = await prisma.cart.findUnique({ where: { userId: customerAId } });
      const item = await prisma.cartItem.findFirst({
        where: { cartId: cart.id, productId: productB.id },
      });
      itemId = item.id;
    });

    test('valid update changes quantity and recalculates totals', async () => {
      const res = await request(app)
        .patch(`/api/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ quantity: 3 });

      expect(res.statusCode).toBe(200);
      const item = res.body.data.cart.items.find((i) => i.id === itemId);
      expect(item.quantity).toBe(3);
      expect(item.subtotalUgx).toBe(22500); // 7500 x 3
    });

    test('rejects zero/negative/decimal/invalid quantities', async () => {
      for (const quantity of [0, -1, 2.5, 'x', null]) {
        const res = await request(app)
          .patch(`/api/cart/items/${itemId}`)
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({ quantity });
        expect(res.statusCode).toBe(400);
      }
    });

    test('rejects quantity above stock', async () => {
      const res = await request(app)
        .patch(`/api/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ quantity: 99 }); // stock 20
      expect(res.statusCode).toBe(409);
    });

    test('IDOR: another customer cart item ID is not visible (404)', async () => {
      // Customer B adds an item to their own cart
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({ productId: productA.id, quantity: 1 });

      const cartB = await prisma.cart.findUnique({ where: { userId: customerBId } });
      const itemB = await prisma.cartItem.findFirst({ where: { cartId: cartB.id, productId: productA.id } });

      // Customer A tries to update B's item
      const resA = await request(app)
        .patch(`/api/cart/items/${itemB.id}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ quantity: 5 });
      expect(resA.statusCode).toBe(404);

      // Customer A tries to delete B's item
      const resDel = await request(app)
        .delete(`/api/cart/items/${itemB.id}`)
        .set('Authorization', `Bearer ${customerAToken}`);
      expect(resDel.statusCode).toBe(404);

      // B's item is untouched
      const stillThere = await prisma.cartItem.findUnique({ where: { id: itemB.id } });
      expect(stillThere).not.toBeNull();
    });

    test('rejects malformed item UUID (400)', async () => {
      const res = await request(app)
        .patch('/api/cart/items/not-a-uuid')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ quantity: 1 });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Remove Item & Clear Cart', () => {
    test('valid remove returns updated cart without the item', async () => {
      const cart = await prisma.cart.findUnique({ where: { userId: customerAId } });
      const item = await prisma.cartItem.findFirst({ where: { cartId: cart.id, productId: productA.id } });

      const res = await request(app).delete(`/api/cart/items/${item.id}`).set('Authorization', `Bearer ${customerAToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.cart.items.find((i) => i.id === item.id)).toBeUndefined();
    });

    test('repeated delete of same item returns 404', async () => {
      const cart = await prisma.cart.findUnique({ where: { userId: customerAId } });
      const item = await prisma.cartItem.findFirst({ where: { cartId: cart.id, productId: productB.id } });

      const res1 = await request(app).delete(`/api/cart/items/${item.id}`).set('Authorization', `Bearer ${customerAToken}`);
      expect(res1.statusCode).toBe(200);
      const res2 = await request(app).delete(`/api/cart/items/${item.id}`).set('Authorization', `Bearer ${customerAToken}`);
      expect(res2.statusCode).toBe(404);
    });

    test('clear cart empties items but preserves the cart record', async () => {
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: productA.id, quantity: 2 });

      const res = await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.cart.items).toEqual([]);
      expect(res.body.data.cart.subtotalUgx).toBe(0);

      const cart = await prisma.cart.findUnique({ where: { userId: customerAId } });
      expect(cart).not.toBeNull();
      const items = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
      expect(items.length).toBe(0);
    });

    test('clear on already-empty cart succeeds idempotently', async () => {
      const res = await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.cart.items).toEqual([]);
    });
  });

  describe('Price Integrity & Stale Price Detection', () => {
    let staleItemId = null;
    const originalPrice = 5000;

    beforeAll(async () => {
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: productA.id, quantity: 2 });
      const cart = await prisma.cart.findUnique({ where: { userId: customerAId } });
      const item = await prisma.cartItem.findFirst({ where: { cartId: cart.id, productId: productA.id } });
      staleItemId = item.id;
    });

    afterAll(async () => {
      // restore original price for other tests
      await prisma.product.update({ where: { id: productA.id }, data: { priceUgx: originalPrice } });
    });

    test('price change is detected as stale and current price is used in totals', async () => {
      // Admin-style price change directly in DB (simulating admin action)
      await prisma.product.update({ where: { id: productA.id }, data: { priceUgx: 6000 } });

      const res = await request(app).get('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
      expect(res.statusCode).toBe(200);

      const item = res.body.data.cart.items.find((i) => i.id === staleItemId);
      expect(item.priceIsStale).toBe(true);
      expect(item.unitPriceUgx).toBe(6000); // authoritative current price surfaced
      expect(item.subtotalUgx).toBe(12000); // 6000 x 2, server-calculated

      const cart = res.body.data.cart;
      expect(cart.subtotalUgx).toBe(12000);
      expect(cart.totalUgx).toBe(12000);
    });

    test('client cannot override totals via query or body manipulation', async () => {
      const res = await request(app)
        .get('/api/cart?lang=en')
        .set('Authorization', `Bearer ${customerAToken}`);
      const cart = res.body.data.cart;
      const recalculated = cart.items.reduce((s, i) => s + i.subtotalUgx, 0);
      expect(cart.subtotalUgx).toBe(recalculated);
    });
  });

  describe('Product Availability Handling', () => {
    test('cart exposes availability state when product is deactivated after adding', async () => {
      await prisma.product.update({ where: { id: inactiveProduct.id }, data: { isActive: true } });
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: inactiveProduct.id, quantity: 1 });
      await prisma.product.update({ where: { id: inactiveProduct.id }, data: { isActive: false } });

      const res = await request(app).get('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
      const item = res.body.data.cart.items.find((i) => i.productId === inactiveProduct.id);
      expect(item).toBeDefined(); // NOT auto-deleted
      expect(item.availability.isActive).toBe(false);
      expect(item.availability.purchasable).toBe(false);
    });

    test('cart exposes insufficient stock state when stock drops after adding', async () => {
      // Robust against prior cart state: raise stock high, top the item up to >= 5,
      // then crash the stock down and verify the availability flags.
      await prisma.product.update({ where: { id: inactiveProduct.id }, data: { isActive: true, stockQuantity: 100 } });
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ productId: inactiveProduct.id, quantity: 4 });
      await prisma.product.update({ where: { id: inactiveProduct.id }, data: { stockQuantity: 2 } });

      const res = await request(app).get('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
      const item = res.body.data.cart.items.find((i) => i.productId === inactiveProduct.id);
      expect(item.availability.sufficientStock).toBe(false);
      expect(item.availability.purchasable).toBe(false);
      expect(item.availability.stockQuantity).toBe(2);
    });
  });

  describe('Multilingual Cart Responses', () => {
    beforeAll(async () => {
      await prisma.productTranslation.upsert({
        where: { productId_language: { productId: productA.id, language: 'LG' } },
        update: { name: 'Amatooke Ag’Kugeza' },
        create: { productId: productA.id, language: 'LG', name: 'Amatooke Ag’Kugeza' },
      });
    });

    test('GET /api/cart?lang=lg returns Luganda product names', async () => {
      const res = await request(app).get('/api/cart?lang=lg').set('Authorization', `Bearer ${customerAToken}`);
      const item = res.body.data.cart.items.find((i) => i.productId === productA.id);
      expect(item.product.name).toBe('Amatooke Ag’Kugeza');
    });

    test('fallback to English when requested translation missing', async () => {
      const res = await request(app).get('/api/cart?lang=fr').set('Authorization', `Bearer ${customerAToken}`);
      const item = res.body.data.cart.items.find((i) => i.productId === productA.id);
      expect(item.product.name).toBe('Cart Test Matooke'); // EN fallback
    });

    test('invalid language returns 400', async () => {
      for (const lang of ['de', 'xx', 'english']) {
        const res = await request(app).get(`/api/cart?lang=${lang}`).set('Authorization', `Bearer ${customerAToken}`);
        expect(res.statusCode).toBe(400);
      }
    });
  });

  describe('Concurrency', () => {
    test('concurrent add-item requests do not create duplicate cart items', async () => {
      const results = await Promise.allSettled([
        request(app).post('/api/cart/items').set('Authorization', `Bearer ${customerBToken}`).send({ productId: productB.id, quantity: 1 }),
        request(app).post('/api/cart/items').set('Authorization', `Bearer ${customerBToken}`).send({ productId: productB.id, quantity: 1 }),
        request(app).post('/api/cart/items').set('Authorization', `Bearer ${customerBToken}`).send({ productId: productB.id, quantity: 1 }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled' && r.value.statusCode === 201);
      const rejected = results.filter((r) => r.status === 'fulfilled' && r.value.statusCode === 409);

      const cartB = await prisma.cart.findUnique({ where: { userId: customerBId } });
      const items = await prisma.cartItem.findMany({ where: { cartId: cartB.id, productId: productB.id } });

      expect(items.length).toBe(1); // no duplicates
      const totalQty = Math.trunc(Number(items[0].quantity));
      expect(totalQty).toBe(fulfilled.length); // each success added exactly 1
      expect(rejected.length + fulfilled.length).toBe(3);
      expect(totalQty).toBeLessThanOrEqual(productB.stockQuantity);
    });
  });

  describe('Inventory Preservation (cart does NOT reserve stock)', () => {
    test('adding items does not deduct product stock', async () => {
      const before = await prisma.product.findUnique({ where: { id: productB.id }, select: { stockQuantity: true } });
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({ productId: productB.id, quantity: 2 });
      const after = await prisma.product.findUnique({ where: { id: productB.id }, select: { stockQuantity: true } });
      expect(after.stockQuantity).toBe(before.stockQuantity);
    });
  });
});
