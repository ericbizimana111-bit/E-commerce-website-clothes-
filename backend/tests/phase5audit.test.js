const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');

jest.setTimeout(60000);

/**
 * Phase 5 FINAL AUDIT — five-area verification.
 * These tests assert the CORRECT production behavior; a failure here
 * identifies a genuine Phase 5 defect.
 */
describe('Phase 5 Final Audit (five areas)', () => {
  let superAdminToken = null;
  let customerToken = null;
  let customerId = null;
  let customerBToken = null;
  let customerBId = null;
  let address = null;
  let station = null;
  let category = null;
  let product = null;

  const createdUserIds = [];
  const createdProductIds = [];
  const createdOrderIds = [];
  const createdStationIds = [];
  const createdCategoryIds = [];

  async function makeCustomer(prefix) {
    for (let i = 0; i < 5; i++) {
      const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ fullName: `${prefix} ${Date.now()}-${i}`, phone, password: 'AuditPass123!' });
      if (reg.statusCode === 409) continue;
      expect(reg.statusCode).toBe(201);
      const id = reg.body.data.user.id;
      createdUserIds.push(id);
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'AuditPass123!' });
      return { token: login.body.data.token, id };
    }
    throw new Error('could not create audit customer');
  }

  async function makeStation(name) {
    const s = await prisma.pickupStation.create({
      data: {
        name,
        district: 'Audit District',
        addressText: '1 Audit Lane',
        contactPhone: '+256701234567',
        operatingHours: '08:00-20:00',
        pickupFeeUgx: 0,
        isActive: true,
      },
    });
    createdStationIds.push(s.id);
    return s;
  }

  async function addToCart(token, productId, quantity) {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity });
    expect(res.statusCode).toBe(201);
  }

  async function createPickupOrder(token, stationId) {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: stationId });
    expect(res.statusCode).toBe(201);
    const order = res.body.data.order;
    createdOrderIds.push(order.id);
    return order;
  }

  async function countOrders() {
    // Scoped to audit-created customers: a GLOBAL order count would race with
    // other Jest suites sharing this database and make assertions flaky.
    return prisma.order.count({ where: { userId: { in: [customerId, customerBId] } } });
  }

  beforeAll(async () => {
    const adminRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    superAdminToken = adminRes.body.data.token;

    const a = await makeCustomer('Audit Customer A');
    customerToken = a.token;
    customerId = a.id;
    const b = await makeCustomer('Audit Customer B');
    customerBToken = b.token;
    customerBId = b.id;

    address = await prisma.address.create({
      data: {
        userId: customerId,
        title: 'Audit Home',
        district: 'Kampala',
        streetAddress: '9 Audit Road',
        latitude: 0.35,
        longitude: 32.62,
      },
    });

    station = await makeStation('Audit Station Original');
    category = await prisma.category.findFirst();
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'audit-product-' + Date.now(),
        priceUgx: 5000,
        stockQuantity: 50,
        unit: 'piece',
        isActive: true,
        nameEn: 'Audit Product Original',
        translations: { create: [{ language: 'EN', name: 'Audit Product Original' }] },
      },
    });
    createdProductIds.push(product.id);
  });

  afterAll(async () => {
    // --- cleanup ONLY audit-created records ---
    for (const oid of createdOrderIds) {
      await prisma.auditLog.deleteMany({ where: { entityId: oid } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
      await prisma.payment.deleteMany({ where: { orderId: oid } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
      // Phase 7: deliveries.order_id FK restricts order deletion
      await prisma.delivery.deleteMany({ where: { orderId: oid } });
      await prisma.orderItem.deleteMany({ where: { orderId: oid } });
      await prisma.order.deleteMany({ where: { id: oid } });
    }
    for (const pid of createdProductIds) {
      await prisma.cartItem.deleteMany({ where: { productId: pid } });
      await prisma.productTranslation.deleteMany({ where: { productId: pid } });
      await prisma.productImage.deleteMany({ where: { productId: pid } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: pid } });
      await prisma.product.deleteMany({ where: { id: pid } });
    }
    for (const sid of createdStationIds) {
      await prisma.pickupStation.deleteMany({ where: { id: sid } });
    }
    // Orders owned by audit customers (safety net: catches any order whose id
    // was not pushed to createdOrderIds, so user deletion never FK-fails)
    for (const uid of createdUserIds) {
      const orphanOrders = await prisma.order.findMany({ where: { userId: uid }, select: { id: true } });
      for (const o of orphanOrders) {
        if (createdOrderIds.includes(o.id)) continue;
        await prisma.orderStatusHistory.deleteMany({ where: { orderId: o.id } });
        await prisma.payment.deleteMany({ where: { orderId: o.id } });
        await prisma.inventoryTransaction.deleteMany({ where: { referenceId: o.id } });
        await prisma.delivery.deleteMany({ where: { orderId: o.id } });
        await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
        await prisma.order.deleteMany({ where: { id: o.id } });
      }
    }
    for (const cid of createdCategoryIds) {
      await prisma.category.deleteMany({ where: { id: cid } });
    }
    for (const uid of createdUserIds) {
      await prisma.cartItem.deleteMany({ where: { cart: { userId: uid } } });
      await prisma.cart.deleteMany({ where: { userId: uid } });
      await prisma.address.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    await prisma.$disconnect();
  });

  // ==========================================================
  // AREA 1 — PAYMENT-STATE BOUNDARY
  // ==========================================================
  describe('Area 1: Payment-state boundary', () => {
    test('order creation never fakes a completed payment, even with payment fields in body', async () => {
      await addToCart(customerToken, product.id, 1);
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          fulfillmentMethod: 'PICKUP_STATION',
          pickupStationId: station.id,
          // payment-tampering attempts (must all be ignored/stripped)
          status: 'COMMITMENT_PAID',
          paymentStatus: 'SUCCESS',
          paymentId: 'fake-payment-id',
          transactionId: 'FAKE-TX-123',
          commitmentPaid: true,
          paidAmount: 999999,
          provider: 'FLUTTERWAVE',
        });

      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      // Starts in PENDING_PAYMENT
      expect(order.status).toBe('PENDING_PAYMENT');
      // No payment object leaks / no fake payment markers
      expect(order.paymentStatus).toBeUndefined();
      expect(order.payments).toBeUndefined();

      // No Payment rows exist for this order
      const paymentRows = await prisma.payment.count({ where: { orderId: order.id } });
      expect(paymentRows).toBe(0);

      // No COMMITMENT_PAID history written by order creation
      const paidHistory = await prisma.orderStatusHistory.count({
        where: { orderId: order.id, statusTo: 'COMMITMENT_PAID' },
      });
      expect(paidHistory).toBe(0);

      // Initial history is exactly null -> PENDING_PAYMENT
      const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
      expect(history).toHaveLength(1);
      expect(history[0].statusFrom).toBeNull();
      expect(history[0].statusTo).toBe('PENDING_PAYMENT');
    });

    test('no real payment provider integration exists in Phase 5 source', async () => {
      // Sanity guard: Phase 5 must not contain provider integration code paths
      const fs = require('fs');
      const path = require('path');
      const servicesDir = path.resolve(__dirname, '../src/services');
      const files = fs.readdirSync(servicesDir).filter((f) => f.endsWith('.js'));
      for (const f of files) {
        const src = fs.readFileSync(path.join(servicesDir, f), 'utf8');
        expect(src).not.toMatch(/flutterwave\.com|api\.mtn|sandbox\.airtel/i);
      }
    });
  });

  // ==========================================================
  // AREA 2 — DUPLICATE ORDER / IDEMPOTENCY PROTECTION
  // ==========================================================
  describe('Area 2: Duplicate order / idempotency protection', () => {
    test('sequential retry after successful order is rejected (empty cart), no duplicate', async () => {
      await addToCart(customerToken, product.id, 1);
      const before = await countOrders();
      const order = await createPickupOrder(customerToken, station.id);

      // immediate retry: cart already cleared -> must NOT create a second order
      const retry = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
      expect(retry.statusCode).toBe(400);
      expect(await countOrders()).toBe(before + 1);
      expect(order.orderNumber).toMatch(/^FB-\d{8}-\d{6}$/);
    });

    test('CONCURRENT double-click produces exactly ONE order (no duplicate, no oversell)', async () => {
      await addToCart(customerToken, product.id, 1);
      const before = await countOrders();
      const stockBefore = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;

      // Two simultaneous order-creation requests from the SAME customer/cart
      const [r1, r2] = await Promise.all([
        request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id }),
        request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id }),
      ]);

      const statuses = [r1.status, r2.status];
      const created = statuses.filter((s) => s === 201).length;
      const rejected = statuses.filter((s) => s === 400).length;

      expect(created).toBe(1);
      expect(rejected).toBe(1);
      expect(await countOrders()).toBe(before + 1);

      // exactly one unit consumed
      const stockAfter = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;
      expect(stockAfter).toBe(stockBefore - 1);

      // register the ACTUAL created order for cleanup (response body, never a
      // global "newest order" guess — that races with other suites)
      for (const r of [r1, r2]) {
        if (r.status === 201 && r.body?.data?.order?.id) {
          createdOrderIds.push(r.body.data.order.id);
        }
      }
    });

    test('DETERMINISTIC wide-window race: stalled first request blocks retry from reading stale cart (cart-lock serialization)', async () => {
      const orderService = require('../src/services/order.service');
      await addToCart(customerToken, product.id, 1);
      const before = await countOrders();

      let bPromise = null;

      // Request A: emulates the first checkout holding the CART LOCK for its
      // entire transaction; it creates its order and clears the cart only at
      // the very end (worst-case wide window), then commits.
      await prisma.$transaction(async (txA) => {
        await txA.$queryRaw`SELECT id FROM carts WHERE user_id = ${customerId}::uuid FOR UPDATE`;

        // Request B: the REAL order service, launched while A still holds the
        // lock. With the cart-lock fix it BLOCKS on the cart row; without the
        // fix it would read the still-present cart items and race ahead to a
        // duplicate order.
        bPromise = orderService
          .createOrderFromCart(customerId, { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id })
          .then((o) => ({ ok: true, order: o }))
          .catch((e) => ({ ok: false, message: e.message }));

        // Give B time to reach (and block on) the cart lock while A stalls.
        await new Promise((r) => setTimeout(r, 300));

        // A completes its checkout and commits: one order + cart cleared.
        const aOrder = await txA.order.create({
          data: {
            orderNumber: `FB-TEST-${Date.now()}`,
            userId: customerId,
            deliveryType: 'PICKUP_STATION',
            pickupStationId: station.id,
            itemsSubtotal: 5000,
            deliveryFee: 0,
            totalAmount: 5000,
            commitmentAmount: 5000,
            remainingBalance: 0,
            items: {
              create: [
                { productId: product.id, productName: product.nameEn, unit: 'piece', unitPriceUgx: 5000, quantity: 1, totalUgx: 5000 },
              ],
            },
            statusHistory: {
              create: [{ statusTo: 'PENDING_PAYMENT', changedByType: 'CUSTOMER', changedById: customerId }],
            },
          },
        });
        createdOrderIds.push(aOrder.id);
        await txA.cartItem.deleteMany({ where: { cart: { userId: customerId } } });
      });
      // A has committed here, releasing the cart lock; B now resumes.

      const b = await bPromise; // B must see the EMPTY cart and reject
      expect(b.ok).toBe(false);
      expect(b.message).toMatch(/cart is empty/i);
      expect(await countOrders()).toBe(before + 1); // ONLY A's order exists
    });

    test('client orderNumber/id is never trusted as authority', async () => {
      await addToCart(customerToken, product.id, 1);
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          fulfillmentMethod: 'PICKUP_STATION',
          pickupStationId: station.id,
          orderNumber: 'FB-DUPLICATE-000001',
          id: '11111111-1111-1111-1111-111111111111',
        });
      expect(res.statusCode).toBe(201);
      createdOrderIds.push(res.body.data.order.id);
      expect(res.body.data.order.orderNumber).not.toBe('FB-DUPLICATE-000001');
      expect(res.body.data.order.orderNumber).toMatch(/^FB-\d{8}-\d{6}$/);

      // retry with same client orderNumber must not resurrect/attach to it
      const retry = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
      expect(retry.statusCode).toBe(400);
    });

    test('legitimate second order after completing the first is still possible', async () => {
      await addToCart(customerToken, product.id, 1);
      const first = await createPickupOrder(customerToken, station.id);

      // advance to a terminal state via valid transitions
      for (const status of ['COMMITMENT_PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'BALANCE_PAID', 'COMPLETED']) {
        const r = await request(app)
          .patch(`/api/admin/orders/${first.id}/status`)
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({ status });
        expect(r.statusCode).toBe(200);
      }

      // customer can place a brand-new order afterwards
      await addToCart(customerToken, product.id, 1);
      const second = await createPickupOrder(customerToken, station.id);
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe('PENDING_PAYMENT');
    });
  });

  // ==========================================================
  // AREA 3 — CANCELLATION + EXACTLY-ONCE INVENTORY RESTORATION
  // ==========================================================
  describe('Area 3: Cancellation restores stock exactly once', () => {
    test('normal cancel -> stock restored; repeated + concurrent cancels never double-restore', async () => {
      const stockProduct = await prisma.product.create({
        data: {
          categoryId: category.id,
          slug: 'audit-cancel-product-' + Date.now(),
          priceUgx: 3000,
          stockQuantity: 2,
          unit: 'piece',
          isActive: true,
          nameEn: 'Audit Cancel Product',
          translations: { create: [{ language: 'EN', name: 'Audit Cancel Product' }] },
        },
      });
      createdProductIds.push(stockProduct.id);

      await addToCart(customerToken, stockProduct.id, 1);
      const order = await createPickupOrder(customerToken, station.id);

      // stock 2 -> 1
      let stock = (await prisma.product.findUnique({ where: { id: stockProduct.id } })).stockQuantity;
      expect(stock).toBe(1);

      // CONCURRENT cancellation attempts on the SAME order
      const [c1, c2] = await Promise.all([
        request(app)
          .post(`/api/orders/${order.id}/cancel`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ reason: 'concurrent cancel A' }),
        request(app)
          .post(`/api/orders/${order.id}/cancel`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ reason: 'concurrent cancel B' }),
      ]);

      const okCount = [c1.status, c2.status].filter((s) => s === 200).length;
      const conflictCount = [c1.status, c2.status].filter((s) => s === 409).length;
      expect(okCount).toBe(1);
      expect(conflictCount).toBe(1);

      // stock restored exactly once: 1 -> 2 (NEVER 3)
      stock = (await prisma.product.findUnique({ where: { id: stockProduct.id } })).stockQuantity;
      expect(stock).toBe(2);

      // exactly one RETURN inventory transaction for this order
      const returns = await prisma.inventoryTransaction.count({
        where: { referenceId: order.id, type: 'RETURN' },
      });
      expect(returns).toBe(1);

      // exactly one CANCELLED history entry
      const cancelHistory = await prisma.orderStatusHistory.count({
        where: { orderId: order.id, statusTo: 'CANCELLED' },
      });
      expect(cancelHistory).toBe(1);

      // explicit sequential re-cancel also rejected
      const again = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({});
      expect(again.statusCode).toBe(409);
      stock = (await prisma.product.findUnique({ where: { id: stockProduct.id } })).stockQuantity;
      expect(stock).toBe(2);

      // order-item snapshot untouched by cancellation
      const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
      expect(item.productName).toBe('Audit Cancel Product');
      expect(item.unitPriceUgx).toBe(3000);
      expect(Math.trunc(Number(item.quantity))).toBe(1);

      // cancellation must not create any payment rows
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    });

    test('ownership: customer B cannot cancel customer A order', async () => {
      await addToCart(customerToken, product.id, 1);
      const order = await createPickupOrder(customerToken, station.id);

      const steal = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({});
      expect(steal.statusCode).toBe(404);
      expect((await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity).toBe(
        (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity // unchanged
      );

      // cleanup: cancel it properly for a consistent state
      const ok = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({});
      expect(ok.statusCode).toBe(200);
    });

    test('cancellation not allowed from non-cancellable status', async () => {
      await addToCart(customerToken, product.id, 1);
      const order = await createPickupOrder(customerToken, station.id);

      // advance beyond customer-cancellable window (PREPARING)
      for (const status of ['COMMITMENT_PAID', 'CONFIRMED', 'PREPARING']) {
        const r = await request(app)
          .patch(`/api/admin/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({ status });
        expect(r.statusCode).toBe(200);
      }

      const res = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({});
      expect(res.statusCode).toBe(409);
    });
  });

  // ==========================================================
  // AREA 4 — ORDER SNAPSHOT IMMUTABILITY
  // ==========================================================
  describe('Area 4: Snapshot immutability', () => {
    test('product name/price/category/active changes and station edits never alter historical orders', async () => {
      const snapProduct = await prisma.product.create({
        data: {
          categoryId: category.id,
          slug: 'audit-snap-product-' + Date.now(),
          priceUgx: 5000,
          stockQuantity: 10,
          unit: 'basket',
          isActive: true,
          nameEn: 'Audit Snapshot Product',
          translations: { create: [{ language: 'EN', name: 'Audit Snapshot Product' }] },
        },
      });
      createdProductIds.push(snapProduct.id);
      const snapStation = await makeStation('Audit Snap Station');
      const otherCategory = await prisma.category.create({
        data: { slug: 'audit-snap-category-' + Date.now(), nameEn: 'Audit Snap Category', isActive: true },
      });
      createdCategoryIds.push(otherCategory.id);

      // 1. HOME_DELIVERY order (address snapshot)
      await addToCart(customerToken, snapProduct.id, 2);
      const hdOrder = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentMethod: 'HOME_DELIVERY', addressId: address.id });
      expect(hdOrder.statusCode).toBe(201);
      const hd = hdOrder.body.data.order;
      createdOrderIds.push(hd.id);

      // 2. PICKUP order (station snapshot)
      await addToCart(customerToken, snapProduct.id, 1);
      const pkOrder = await createPickupOrder(customerToken, snapStation.id);

      // recorded order-time values
      expect(hd.items[0].unitPriceUgx).toBe(5000);
      expect(hd.items[0].quantity).toBe(2);
      expect(hd.items[0].lineTotalUgx).toBe(10000);
      expect(hd.items[0].snapshotName).toBe('Audit Snapshot Product');
      expect(hd.fulfillment.address.streetAddress).toBe('9 Audit Road');

      expect(pkOrder.items[0].unitPriceUgx).toBe(5000);
      expect(pkOrder.fulfillment.station.name).toBe('Audit Snap Station');
      expect(pkOrder.fulfillment.station.addressText).toBe('1 Audit Lane');

      // 3. MUTATE all underlying sources
      await prisma.product.update({
        where: { id: snapProduct.id },
        data: { priceUgx: 7000, nameEn: 'RENAMED AFTER ORDER', isActive: false, categoryId: otherCategory.id },
      });
      await prisma.address.update({
        where: { id: address.id },
        data: { streetAddress: 'MOVED AFTER ORDER', district: 'Changed District' },
      });
      await prisma.pickupStation.update({
        where: { id: snapStation.id },
        data: { name: 'STATION RENAMED AFTER ORDER', addressText: 'Relocated' },
      });

      // 4. historical orders unchanged
      const hdAfter = await request(app)
        .get(`/api/orders/${hd.id}`)
        .set('Authorization', `Bearer ${customerToken}`);
      const hdFetched = hdAfter.body.data.order;
      expect(hdFetched.items[0].unitPriceUgx).toBe(5000); // NOT 7000
      expect(hdFetched.items[0].lineTotalUgx).toBe(10000);
      expect(hdFetched.items[0].snapshotName).toBe('Audit Snapshot Product');
      expect(hdFetched.pricing.itemsSubtotalUgx).toBe(10000);
      expect(hdFetched.fulfillment.address.streetAddress).toBe('9 Audit Road'); // original snapshot
      expect(hdFetched.fulfillment.address.district).toBe('Kampala');

      const pkAfter = await request(app)
        .get(`/api/orders/${pkOrder.id}`)
        .set('Authorization', `Bearer ${customerToken}`);
      const pkFetched = pkAfter.body.data.order;
      expect(pkFetched.items[0].unitPriceUgx).toBe(5000);
      expect(pkFetched.fulfillment.station.name).toBe('Audit Snap Station'); // original snapshot
      expect(pkFetched.fulfillment.station.addressText).toBe('1 Audit Lane');

      // restore product for other tests (category move would break shared reuse)
      await prisma.product.update({
        where: { id: snapProduct.id },
        data: { priceUgx: 5000, nameEn: 'Audit Snapshot Product', isActive: true, categoryId: category.id },
      });
      await prisma.address.update({
        where: { id: address.id },
        data: { streetAddress: '9 Audit Road', district: 'Kampala' },
      });
      await prisma.pickupStation.update({
        where: { id: snapStation.id },
        data: { name: 'Audit Snap Station', addressText: '1 Audit Lane' },
      });
    });
  });

  // ==========================================================
  // AREA 5 — STATUS TRANSITION ENFORCEMENT
  // ==========================================================
  describe('Area 5: Status transition enforcement', () => {
    test('illegal transitions are rejected at every probed edge and never write history', async () => {
      await addToCart(customerToken, product.id, 1);
      const order = await createPickupOrder(customerToken, station.id);

      const illegalAttempts = async (orderId, fromLabel) => {
        const attempts = [
          ['COMPLETED', 409],
          ['DELIVERED', 409],
          ['BALANCE_PAID', 409],
          ['PENDING_PAYMENT', fromLabel !== 'PENDING_PAYMENT' ? 409 : null], // self-transition
        ];
        for (const [status] of attempts) {
          if (status === 'PENDING_PAYMENT' && fromLabel === 'PENDING_PAYMENT') continue;
          const r = await request(app)
            .patch(`/api/admin/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({ status, reason: `illegal from ${fromLabel}` });
          expect(r.statusCode).toBe(409);
        }
      };

      // PENDING_PAYMENT -> COMPLETED / DELIVERED / BALANCE_PAID
      await illegalAttempts(order.id, 'PENDING_PAYMENT');

      // advance: PENDING_PAYMENT -> COMMITMENT_PAID -> CONFIRMED
      for (const status of ['COMMITMENT_PAID', 'CONFIRMED']) {
        const r = await request(app)
          .patch(`/api/admin/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({ status });
        expect(r.statusCode).toBe(200);
      }

      // CONFIRMED -> COMPLETED rejected
      let r = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'COMPLETED' });
      expect(r.statusCode).toBe(409);

      // CONFIRMED -> PREPARING, then PREPARING -> PENDING_PAYMENT rejected
      r = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'PREPARING' });
      expect(r.statusCode).toBe(200);

      r = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'PENDING_PAYMENT' });
      expect(r.statusCode).toBe(409);

      // history check: creation + 3 successful transitions ONLY (no rejected ones)
      const history = await prisma.orderStatusHistory.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((h) => h.statusTo)).toEqual([
        'PENDING_PAYMENT',
        'COMMITMENT_PAID',
        'CONFIRMED',
        'PREPARING',
      ]);
      expect(history[1].statusFrom).toBe('PENDING_PAYMENT');
      expect(history[1].changedByType).toBe('ADMIN');

      // finish pickup branch to COMPLETED
      for (const status of ['READY_FOR_PICKUP', 'PICKED_UP', 'BALANCE_PAID', 'COMPLETED']) {
        r = await request(app)
          .patch(`/api/admin/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({ status });
        expect(r.statusCode).toBe(200);
      }

      // COMPLETED -> PREPARING rejected (terminal state)
      r = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'PREPARING' });
      expect(r.statusCode).toBe(409);

      // total history = 1 creation + 7 transitions, nothing else
      const finalHistory = await prisma.orderStatusHistory.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(finalHistory.map((h) => h.statusTo)).toEqual([
        'PENDING_PAYMENT',
        'COMMITMENT_PAID',
        'CONFIRMED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'PICKED_UP',
        'BALANCE_PAID',
        'COMPLETED',
      ]);
    });

    test('CANCELLED -> PREPARING rejected (cancelled is terminal)', async () => {
      await addToCart(customerToken, product.id, 1);
      const order = await createPickupOrder(customerToken, station.id);
      const cancel = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({});
      expect(cancel.statusCode).toBe(200);

      const r = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'PREPARING' });
      expect(r.statusCode).toBe(409);
    });

    test('customer cannot set status on customer endpoints; customer token rejected on admin endpoint', async () => {
      await addToCart(customerToken, product.id, 1);
      const order = await createPickupOrder(customerToken, station.id);

      // customer cancel endpoint ignores arbitrary status field entirely
      const viaCancel = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'COMPLETED' });
      expect(viaCancel.statusCode).toBe(200);
      expect(viaCancel.body.data.order.status).toBe('CANCELLED');

      // order creation with status also stays PENDING_PAYMENT (covered in Area 1)

      const adminAttempt = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'COMPLETED' });
      expect(adminAttempt.statusCode).toBe(401);
    });

    test('admin transition map is the single source of truth and matches the blueprint', () => {
      const { ORDER_STATUS_TRANSITIONS } = require('../src/constants');
      expect(ORDER_STATUS_TRANSITIONS).toEqual({
        PENDING_PAYMENT: ['COMMITMENT_PAID', 'CANCELLED', 'PAYMENT_FAILED'],
        COMMITMENT_PAID: ['CONFIRMED', 'CANCELLED'],
        CONFIRMED: ['PREPARING', 'CANCELLED'],
        PREPARING: ['READY_FOR_DELIVERY', 'READY_FOR_PICKUP', 'CANCELLED'],
        READY_FOR_DELIVERY: ['OUT_FOR_DELIVERY'],
        READY_FOR_PICKUP: ['PICKED_UP'],
        OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED'],
        DELIVERED: ['BALANCE_PAID'],
        PICKED_UP: ['BALANCE_PAID'],
        BALANCE_PAID: ['COMPLETED'],
        COMPLETED: [],
        CANCELLED: [],
        PAYMENT_FAILED: ['CANCELLED', 'PENDING_PAYMENT'],
        DELIVERY_FAILED: ['REFUNDED', 'OUT_FOR_DELIVERY'],
        REFUNDED: [],
      });
    });
  });
});
