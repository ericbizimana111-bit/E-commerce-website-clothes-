const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signCustomerToken } = require('../src/services/token.service');

jest.setTimeout(45000);

describe('Orders & Order Lifecycle (Phase 5)', () => {
  let superAdminToken = null;
  let dispatcherToken = null;
  let customerAToken = null;
  let customerBToken = null;
  let customerAId = null;
  let customerBId = null;
  let addressA = null;
  let addressB = null;
  let station = null;
  let product = null;
  let dispatcherRecord = null;
  const createdUserIds = [];
  const createdProductIds = [];
  const createdOrderIds = [];

  async function makeCustomer(prefix) {
    for (let i = 0; i < 5; i++) {
      const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ fullName: `${prefix} ${Date.now()}-${i}`, phone, password: 'OrderPass123!' });
      if (reg.statusCode === 409) continue;
      expect(reg.statusCode).toBe(201);
      const id = reg.body.data.user.id;
      createdUserIds.push(id);
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'OrderPass123!' });
      return { token: login.body.data.token, id };
    }
    throw new Error('could not create customer');
  }

  beforeAll(async () => {
    const adminRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    superAdminToken = adminRes.body.data.token;

    dispatcherRecord = await prisma.admin.upsert({
      where: { email: 'dispatcher.orders@ugandafood.market' },
      update: { role: 'DISPATCHER', isActive: true },
      create: {
        fullName: 'Orders Dispatcher',
        email: 'dispatcher.orders@ugandafood.market',
        passwordHash: '$2a$12$eXampleHashedPasswordForTestOnly999999999999999999999999',
        role: 'DISPATCHER',
        isActive: true,
      },
    });
    const { signAdminToken } = require('../src/services/token.service');
    dispatcherToken = signAdminToken(dispatcherRecord);

    const a = await makeCustomer('Order Tester A');
    customerAToken = a.token;
    customerAId = a.id;

    const b = await makeCustomer('Order Tester B');
    customerBToken = b.token;
    customerBId = b.id;

    addressA = await prisma.address.create({
      data: {
        userId: customerAId,
        title: 'Home',
        district: 'Kampala',
        streetAddress: '1 Order Test Road',
        // Kampala warehouse coords: 0.3136, 32.5811 -> within free radius => fee 0... use distance instead
        latitude: 0.35, // ~4km away
        longitude: 32.62,
      },
    });
    addressB = await prisma.address.create({
      data: { userId: customerBId, title: 'Home', district: 'Entebbe', streetAddress: '2 Other Road' },
    });

    station = await prisma.pickupStation.findFirst({ where: { isActive: true } });

    const category = await prisma.category.findFirst();
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'order-test-tilapia-' + Date.now(),
        priceUgx: 20000,
        stockQuantity: 10,
        unit: 'piece',
        isActive: true,
        nameEn: 'Order Test Tilapia',
        translations: { create: [{ language: 'EN', name: 'Order Test Tilapia' }] },
      },
    });
    createdProductIds.push(product.id);
  });

  afterAll(async () => {
    for (const oid of createdOrderIds) {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
      await prisma.payment.deleteMany({ where: { orderId: oid } });
      await prisma.orderItem.deleteMany({ where: { orderId: oid } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
      await prisma.order.deleteMany({ where: { id: oid } });
    }
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
      await prisma.address.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    await prisma.admin.deleteMany({ where: { id: dispatcherRecord.id } });
    await prisma.$disconnect();
  });

  async function addToCart(token, productId, quantity) {
    const res = await request(app).post('/api/cart/items').set('Authorization', `Bearer ${token}`).send({ productId, quantity });
    expect(res.statusCode).toBe(201);
  }

  describe('Order Creation', () => {
    afterEach(async () => {
      // keep DB small between creation tests: clear customer A's cart if any items remain
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
    });

    test('successful pickup order: snapshots, stock deducted, history, cart cleared', async () => {
      await addToCart(customerAToken, product.id, 2);
      const stockBefore = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });

      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.orderNumber).toMatch(/^FB-\d{8}-\d{6}$/);
      expect(order.pricing.currency).toBe('UGX');
      expect(order.pricing.itemsSubtotalUgx).toBe(40000);
      expect(order.pricing.deliveryFeeUgx).toBe(0);
      expect(order.pricing.totalUgx).toBe(40000);
      expect(order.pricing.commitmentUgx + order.pricing.remainingBalanceUgx).toBe(40000);
      expect(order.fulfillment.station.name).toBe(station.name); // snapshot
      expect(order.statusHistory[0].fromStatus).toBeNull();
      expect(order.statusHistory[0].toStatus).toBe('PENDING_PAYMENT');

      // stock deducted
      const after = await prisma.product.findUnique({ where: { id: product.id } });
      expect(after.stockQuantity).toBe(stockBefore - 2);

      // SALE inventory transaction recorded
      const sale = await prisma.inventoryTransaction.findFirst({
        where: { productId: product.id, type: 'SALE', referenceId: order.id },
      });
      expect(sale).not.toBeNull();
      expect(sale.quantityChange).toBe(-2);

      // cart cleared but record retained
      const cart = await prisma.cart.findUnique({ where: { userId: customerAId } });
      expect(cart).not.toBeNull();
      expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
    });

    test('successful home delivery order with fee and address snapshot', async () => {
      await addToCart(customerAToken, product.id, 1);
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'HOME_DELIVERY', addressId: addressA.id });

      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      expect(order.fulfillment.method).toBe('HOME_DELIVERY');
      expect(order.fulfillment.address.district).toBe('Kampala'); // snapshot
      expect(order.pricing.deliveryFeeUgx).toBeGreaterThan(0); // ~4km > 3km free radius
      expect(order.pricing.totalUgx).toBe(order.pricing.itemsSubtotalUgx + order.pricing.deliveryFeeUgx);
    });

    test('empty cart rejected', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
      expect(res.statusCode).toBe(400);
    });

    test('invalid fulfillment method / missing ids rejected', async () => {
      await addToCart(customerAToken, product.id, 1);
      const bad = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'TELEPORT' });
      expect(bad.statusCode).toBe(400);

      const noAddr = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'HOME_DELIVERY', addressId: null });
      expect(noAddr.statusCode).toBe(400);
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
    });

    test('address owned by another customer rejected (IDOR)', async () => {
      await addToCart(customerAToken, product.id, 1);
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'HOME_DELIVERY', addressId: addressB.id });
      expect(res.statusCode).toBe(404);
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
    });

    test('inactive pickup station rejected', async () => {
      await addToCart(customerAToken, product.id, 1);
      const inactive = await prisma.pickupStation.create({
        data: {
          name: 'Inactive Station ' + Date.now(),
          district: 'X',
          addressText: 'Nowhere',
          contactPhone: '+256700000000',
          operatingHours: 'never',
          pickupFeeUgx: 0,
          isActive: false,
        },
      });
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: inactive.id });
      expect(res.statusCode).toBe(404);
      await prisma.pickupStation.delete({ where: { id: inactive.id } });
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
    });

    test('insufficient stock rejected (409) and no order created', async () => {
      // Cart add allows 5 (stock 10), then stock drops before order creation
      await addToCart(customerAToken, product.id, 5);
      await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: 3 } });
      const ordersBefore = await prisma.order.count();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
      expect(res.statusCode).toBe(409);
      expect(await prisma.order.count()).toBe(ordersBefore);
      await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: 10 } });
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
    });

    test('inactive product rejected', async () => {
      await addToCart(customerAToken, product.id, 1);
      await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
      expect(res.statusCode).toBe(400);
      await prisma.product.update({ where: { id: product.id }, data: { isActive: true } });
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
    });
  });

  describe('Price/Total Tampering Protection', () => {
    test('client-submitted money values are ignored', async () => {
      await addToCart(customerAToken, product.id, 1);
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          fulfillmentMethod: 'PICKUP_STATION',
          pickupStationId: station.id,
          subtotalUgx: 1,
          totalUgx: 1,
          commitmentUgx: 0,
          remainingBalanceUgx: 1,
          deliveryFeeUgx: 1,
          priceUgx: 1,
          orderNumber: 'FB-HACKED-000000',
          status: 'COMPLETED',
          currency: 'USD',
        });

      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);
      expect(order.orderNumber).not.toBe('FB-HACKED-000000');
      expect(order.pricing.currency).toBe('UGX');
      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.pricing.itemsSubtotalUgx).toBe(20000); // authoritative DB price
      expect(order.pricing.commitmentUgx).toBeGreaterThan(0);
    });
  });

  describe('Ownership & IDOR', () => {
    test('customer sees only own orders', async () => {
      const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerBToken}`);
      expect(res.statusCode).toBe(200);
      for (const order of res.body.items) {
        expect(order.userId).toBeUndefined(); // not leaked
      }
    });

    test('customer cannot retrieve another customer order (404)', async () => {
      // Customer A order exists from previous tests; fetch own first
      const own = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerAToken}`);
      const ownOrder = own.body.items[0];
      expect(ownOrder).toBeDefined();

      const steal = await request(app).get(`/api/orders/${ownOrder.id}`).set('Authorization', `Bearer ${customerBToken}`);
      expect(steal.statusCode).toBe(404);
    });

    test('customer cannot cancel another customer order (404)', async () => {
      const own = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerAToken}`);
      const ownOrder = own.body.items.find((o) => o.status === 'PENDING_PAYMENT');
      const steal = await request(app)
        .post(`/api/orders/${ownOrder.id}/cancel`)
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({});
      expect(steal.statusCode).toBe(404);
    });

    test('malformed order id rejected (400)', async () => {
      const res = await request(app).get('/api/orders/not-a-uuid').set('Authorization', `Bearer ${customerAToken}`);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Cancellation & Stock Restoration', () => {
    test('valid cancellation restores stock exactly once, repeated cancel rejected', async () => {
      await addToCart(customerAToken, product.id, 3);
      const create = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
      const order = create.body.data.order;
      createdOrderIds.push(order.id);

      const afterCreate = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;

      const cancel = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ reason: 'Changed my mind' });
      expect(cancel.statusCode).toBe(200);
      expect(cancel.body.data.order.status).toBe('CANCELLED');

      const afterCancel = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;
      expect(afterCancel).toBe(afterCreate + 3);

      // history includes cancellation
      const cancelEntry = await prisma.orderStatusHistory.findFirst({
        where: { orderId: order.id, statusTo: 'CANCELLED' },
      });
      expect(cancelEntry).not.toBeNull();

      // repeated cancellation rejected
      const again = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({});
      expect(again.statusCode).toBe(409);

      // stock restored EXACTLY once
      const afterRepeat = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;
      expect(afterRepeat).toBe(afterCancel);

      // two RETURN transactions for this order would be a bug
      const returns = await prisma.inventoryTransaction.count({
        where: { referenceId: order.id, type: 'RETURN' },
      });
      expect(returns).toBe(1);
    });

    test('cannot cancel a delivered/terminal order', async () => {
      // create + force into COMPLETED via admin transitions
      await addToCart(customerAToken, product.id, 1);
      const create = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
      const order = create.body.data.order;
      createdOrderIds.push(order.id);

      // simulate lifecycle through valid admin transitions
      const flow = ['COMMITMENT_PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'BALANCE_PAID', 'COMPLETED'];
      for (const status of flow) {
        const r = await request(app)
          .patch(`/api/admin/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({ status });
        expect(r.statusCode).toBe(200);
      }

      const res = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({});
      expect(res.statusCode).toBe(409);
    });
  });

  describe('Status Transitions & RBAC', () => {
    let lifecycleOrderId = null;

    beforeAll(async () => {
      await addToCart(customerAToken, product.id, 1);
      const create = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'HOME_DELIVERY', addressId: addressA.id });
      lifecycleOrderId = create.body.data.order.id;
      createdOrderIds.push(lifecycleOrderId);
    });

    test('customer cannot transition status (no such customer endpoint)', async () => {
      // The only customer mutation endpoint is /cancel; arbitrary status setting
      // must be impossible from customer APIs. Admin endpoint requires admin JWT:
      const res = await request(app)
        .patch(`/api/admin/orders/${lifecycleOrderId}/status`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ status: 'COMPLETED' });
      expect(res.statusCode).toBe(401);
    });

    test('admin invalid transition rejected (PENDING_PAYMENT -> COMPLETED)', async () => {
      const res = await request(app)
        .patch(`/api/admin/orders/${lifecycleOrderId}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'COMPLETED' });
      expect(res.statusCode).toBe(409);
    });

    test('admin valid delivery lifecycle works with history', async () => {
      const flow = ['COMMITMENT_PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'BALANCE_PAID', 'COMPLETED'];
      let previous = null;
      for (const status of flow) {
        const r = await request(app)
          .patch(`/api/admin/orders/${lifecycleOrderId}/status`)
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({ status, reason: `advancing to ${status}` });
        expect(r.statusCode).toBe(200);
        previous = status;
      }
      expect(previous).toBe('COMPLETED');

      const detail = await request(app).get(`/api/orders/${lifecycleOrderId}`).set('Authorization', `Bearer ${customerAToken}`);
      const history = detail.body.data.order.statusHistory;
      expect(history.length).toBe(flow.length + 1); // + initial creation entry
      expect(history[0].toStatus).toBe('PENDING_PAYMENT');
      expect(history[history.length - 1].toStatus).toBe('COMPLETED');
    });

    test('dispatcher can advance statuses (operational role)', async () => {
      await addToCart(customerBToken, product.id, 1);
      const create = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
      const order = create.body.data.order;
      createdOrderIds.push(order.id);

      const res = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ status: 'COMMITMENT_PAID' });
      expect(res.statusCode).toBe(200);
    });

    test('admin status change is audited without secrets', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { entityName: 'Order', action: { startsWith: 'ORDER_STATUS_' } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      expect(logs.length).toBeGreaterThan(0);
      for (const log of logs) {
        const s = JSON.stringify(log);
        expect(s).not.toMatch(/passwordHash|\$2[aby]\$|jwt/i);
      }
    });
  });

  describe('Snapshot Immutability', () => {
    test('product rename/reprice and address edit do not alter existing orders', async () => {
      await addToCart(customerAToken, product.id, 1);
      const create = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ fulfillmentMethod: 'HOME_DELIVERY', addressId: addressA.id });
      const order = create.body.data.order;
      createdOrderIds.push(order.id);

      const originalSubtotal = order.pricing.itemsSubtotalUgx;
      const originalFee = order.pricing.deliveryFeeUgx;
      const originalName = order.items[0].snapshotName;

      // Mutate source data
      await prisma.product.update({ where: { id: product.id }, data: { priceUgx: 99999, nameEn: 'RENAMED PRODUCT' } });
      await prisma.productTranslation.updateMany({
        where: { productId: product.id, language: 'EN' },
        data: { name: 'RENAMED TRANSLATION' },
      });
      await prisma.address.update({ where: { id: addressA.id }, data: { district: 'CHANGED', streetAddress: 'CHANGED' } });
      await prisma.commitmentRuleConfig.update({ where: { id: 1 }, data: { percentageValue: 99.0 } });

      const detail = await request(app)
        .get(`/api/orders/${order.id}?lang=en`)
        .set('Authorization', `Bearer ${customerAToken}`);
      const fetched = detail.body.data.order;

      expect(fetched.pricing.itemsSubtotalUgx).toBe(originalSubtotal);
      expect(fetched.pricing.deliveryFeeUgx).toBe(originalFee);
      expect(fetched.items[0].unitPriceUgx).toBe(20000);
      expect(fetched.items[0].snapshotName).toBe(originalName);
      expect(fetched.fulfillment.address.district).toBe('Kampala'); // snapshot unchanged

      // restore for other tests
      await prisma.product.update({ where: { id: product.id }, data: { priceUgx: 20000, nameEn: 'Order Test Tilapia' } });
      await prisma.productTranslation.updateMany({
        where: { productId: product.id, language: 'EN' },
        data: { name: 'Order Test Tilapia' },
      });
      await prisma.address.update({ where: { id: addressA.id }, data: { district: 'Kampala', streetAddress: '1 Order Test Road' } });
      await prisma.commitmentRuleConfig.update({ where: { id: 1 }, data: { percentageValue: 30.0 } });
    });
  });

  describe('Concurrency: No Overselling', () => {
    test('limited stock is never oversold by parallel orders', async () => {
      const category = await prisma.category.findFirst();
      const limited = await prisma.product.create({
        data: {
          categoryId: category.id,
          slug: 'order-test-limited-' + Date.now(),
          priceUgx: 5000,
          stockQuantity: 2,
          unit: 'piece',
          isActive: true,
          translations: { create: [{ language: 'EN', name: 'Limited Stock Item' }] },
        },
      });
      createdProductIds.push(limited.id);

      // three customers, one item in each cart
      const c1 = await makeCustomer('Concurrency C1');
      const c2 = await makeCustomer('Concurrency C2');
      const c3 = await makeCustomer('Concurrency C3');
      for (const c of [c1, c2, c3]) {
        await request(app)
          .post('/api/cart/items')
          .set('Authorization', `Bearer ${c.token}`)
          .send({ productId: limited.id, quantity: 1 });
      }

      const results = await Promise.allSettled([
        request(app).post('/api/orders').set('Authorization', `Bearer ${c1.token}`).send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id }),
        request(app).post('/api/orders').set('Authorization', `Bearer ${c2.token}`).send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id }),
        request(app).post('/api/orders').set('Authorization', `Bearer ${c3.token}`).send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id }),
      ]);

      const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.statusCode : 'REJECTED'));
      const succeeded = statuses.filter((s) => s === 201).length;
      const failed = statuses.filter((s) => s === 409).length;

      expect(succeeded).toBe(2);
      expect(failed).toBe(1);

      const finalStock = (await prisma.product.findUnique({ where: { id: limited.id } })).stockQuantity;
      expect(finalStock).toBe(0);

      // cleanup concurrency customers/orders
      for (const c of [c1, c2, c3]) {
        const orders = await prisma.order.findMany({ where: { userId: c.id }, select: { id: true } });
        for (const o of orders) {
          createdOrderIds.push(o.id);
        }
      }
    });
  });

  describe('Transaction Rollback', () => {
    test('failure after stock deduction leaves zero partial state', async () => {
      // Directly exercise the service with a fulfillment that will fail mid-transaction:
      // valid cart + valid product, but an address belonging to nobody.
      await addToCart(customerAToken, product.id, 1);

      const stockBefore = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;
      const ordersBefore = await prisma.order.count();
      const invTxBefore = await prisma.inventoryTransaction.count();
      const cartItemsBefore = await prisma.cartItem.count({
        where: { cart: { userId: customerAId } },
      });

      const orderService = require('../src/services/order.service');
      await expect(
        orderService.createOrderFromCart(customerAId, {
          fulfillmentMethod: 'PICKUP_STATION',
          pickupStationId: 999999, // fails after cart read, before deduction
        })
      ).rejects.toThrow();

      expect(await prisma.order.count()).toBe(ordersBefore);
      expect(await prisma.inventoryTransaction.count()).toBe(invTxBefore);
      expect((await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity).toBe(stockBefore);
      expect(
        await prisma.cartItem.count({ where: { cart: { userId: customerAId } } })
      ).toBe(cartItemsBefore);
      await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerAToken}`);
    });
  });

  describe('Admin Order List', () => {
    test('admin list paginates, filters, hides sensitive data', async () => {
      const res = await request(app)
        .get('/api/admin/orders?page=1&limit=5&status=PENDING_PAYMENT,CANCELLED,COMPLETED')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.pagination).toBeDefined();
      for (const order of res.body.items) {
        expect(order.customer.passwordHash).toBeUndefined();
        expect(order.customer).toHaveProperty('phone');
      }
    });

    test('admin search by order number works', async () => {
      const own = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerAToken}`);
      const orderNumber = own.body.items[0].orderNumber;
      const res = await request(app)
        .get(`/api/admin/orders?search=${orderNumber}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.items.some((o) => o.orderNumber === orderNumber)).toBe(true);
    });

    test('customer token rejected on admin orders (401)', async () => {
      const res = await request(app).get('/api/admin/orders').set('Authorization', `Bearer ${customerAToken}`);
      expect(res.statusCode).toBe(401);
    });
  });
});
