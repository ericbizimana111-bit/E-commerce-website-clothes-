const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signMockWebhook } = require('../src/services/paymentProviders/mockProvider');

jest.setTimeout(60000);

/**
 * Phase 6 — Commitment payment API surface:
 * initiation, authoritative amounts, tampering protection, IDOR,
 * failure/retry, success/retry, cancellation interaction.
 *
 * Payment outcomes are driven through SIGNED WEBHOOKS only — the exact
 * mechanism a real provider uses — never by client-side assertions.
 */
describe('Phase 6 Payment API', () => {
  let customerToken = null;
  let customerId = null;
  let otherToken = null;
  let otherUserId = null;
  let station = null;
  let category = null;
  let product = null;
  let adminToken = null;

  const createdUserIds = [];
  const createdProductIds = [];
  const createdOrderIds = [];

  async function makeCustomer(name) {
    for (let i = 0; i < 5; i++) {
      const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
      const reg = await request(app).post('/api/auth/register').send({ fullName: `${name} ${Date.now()}-${i}`, phone, password: 'PayPass123!' });
      if (reg.statusCode === 409) continue;
      expect(reg.statusCode).toBe(201);
      const id = reg.body.data.user.id;
      createdUserIds.push(id);
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'PayPass123!' });
      return { token: login.body.data.token, id };
    }
    throw new Error('could not create payment test customer');
  }

  async function addToCart(productId, quantity) {
    const res = await request(app).post('/api/cart/items').set('Authorization', `Bearer ${customerToken}`).send({ productId, quantity });
    expect(res.statusCode).toBe(201);
  }

  async function createPickupOrder() {
    await addToCart(product.id, 1);
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${customerToken}`).send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
    expect(res.statusCode).toBe(201);
    const order = res.body.data.order;
    createdOrderIds.push(order.id);
    return order;
  }

  /**
   * Initiate a commitment payment and return { res, payment, signAndPost }.
   * signAndPost(body) signs a provider event for this attempt and delivers it
   * through the public webhook endpoint.
   */
  async function initiate(orderId, body = {}) {
    const res = await request(app).post(`/api/orders/${orderId}/payment`).set('Authorization', `Bearer ${customerToken}`).send(body);
    return res;
  }

  function webhookPoster(payment, order) {
    // A real provider always includes amount/currency/orderNumber in every
    // event; overrides exist to test explicit deviations.
    return function postWebhook(outcome, overrides = {}) {
      const body = {
        providerRef: overrides.providerRef || payment.providerRef,
        orderNumber: overrides.orderNumber || order.orderNumber,
        amountUgx: overrides.amountUgx !== undefined ? overrides.amountUgx : payment.amountUgx,
        currency: overrides.currency || 'UGX',
        outcome,
      };
      const raw = JSON.stringify(body);
      const headers = overrides.signature === null
        ? {}
        : { 'x-ugafresh-signature': overrides.signature || signMockWebhook(raw) };
      return request(app).post('/api/payments/webhook').set(headers).send(body);
    };
  }

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/admin/auth/login').send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    adminToken = adminRes.body.data.token;

    const a = await makeCustomer('Pay Customer A');
    customerToken = a.token;
    customerId = a.id;
    const b = await makeCustomer('Pay Customer B');
    otherToken = b.token;
    otherUserId = b.id;

    station = await prisma.pickupStation.findFirst({ where: { isActive: true } });
    category = await prisma.category.findFirst();
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'pay-test-product-' + Date.now(),
        priceUgx: 30000,
        stockQuantity: 50,
        unit: 'piece',
        isActive: true,
        nameEn: 'Pay Test Product',
        translations: { create: [{ language: 'EN', name: 'Pay Test Product' }] },
      },
    });
    createdProductIds.push(product.id);
  });

  afterAll(async () => {
    for (const oid of createdOrderIds) {
      await prisma.auditLog.deleteMany({ where: { entityId: oid } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
      await prisma.payment.deleteMany({ where: { orderId: oid } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
      await prisma.orderItem.deleteMany({ where: { orderId: oid } });
      await prisma.order.deleteMany({ where: { id: oid } });
    }
    // payment-scoped audit rows reference the PAYMENT id, not the order id
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

  // ============================================================
  // Payment creation / initiation
  // ============================================================
  describe('Payment initiation', () => {
    test('new order is PENDING_PAYMENT with no payment rows; initiation creates PENDING attempt at the authoritative amount', async () => {
      const order = await createPickupOrder();
      expect(order.status).toBe('PENDING_PAYMENT');
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);

      const res = await initiate(order.id);
      expect(res.statusCode).toBe(200);
      const p = res.body.data.payment;
      expect(p.status).toBe('PENDING');
      expect(p.purpose).toBe('COMMITMENT');
      expect(p.currency).toBe('UGX');
      expect(p.amountUgx).toBe(order.pricing.commitmentUgx);
      expect(p.transactionRef).toMatch(/^PAY-/);
      expect(p.providerRef).toMatch(/^MOCK-PAY-/);
      // "initiated" must not mean "paid"
      expect(order.status).toBe('PENDING_PAYMENT');
      expect(res.body.data.order.status).toBe('PENDING_PAYMENT');
    });

    test('initiation retry reuses the same active attempt (no duplicate)', async () => {
      const order = await createPickupOrder();
      const r1 = await initiate(order.id);
      expect(r1.statusCode).toBe(200);
      const r2 = await initiate(order.id);
      expect(r2.statusCode).toBe(200);
      expect(r2.body.data.payment.id).toBe(r1.body.data.payment.id);
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    });

    test('initiation for a nonexistent order returns 404', async () => {
      const res = await initiate('00000000-0000-0000-0000-0000000000aa');
      expect(res.statusCode).toBe(404);
    });

    test('IDOR: customer B cannot initiate or view customer A payment', async () => {
      const order = await createPickupOrder();
      const steal = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${otherToken}`).send({});
      expect(steal.statusCode).toBe(404);
      const peek = await request(app).get(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${otherToken}`);
      expect(peek.statusCode).toBe(404);
      // owner can view (empty before initiation)
      const own = await request(app).get(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerToken}`);
      expect(own.statusCode).toBe(200);
    });

    test('client cannot tamper with amount, currency, or status via the initiation body', async () => {
      const order = await createPickupOrder();
      const res = await initiate(order.id, {
        amount: 1,
        amountUgx: 1,
        currency: 'USD',
        status: 'SUCCESS',
        paymentStatus: 'SUCCESS',
        paid: true,
        providerRef: 'FAKE-REF',
        transactionRef: 'PAY-FAKE',
        provider: 'FLUTTERWAVE',
        mockOutcome: 'SUCCESS',
      });
      expect(res.statusCode).toBe(200);
      const p = res.body.data.payment;
      expect(p.status).toBe('PENDING'); // NOT SUCCESS
      expect(p.currency).toBe('UGX'); // NOT USD
      expect(p.amountUgx).toBe(order.pricing.commitmentUgx); // NOT 1
      expect(p.provider).toBe('MOCK'); // NOT FLUTTERWAVE
      expect(p.providerRef.startsWith('MOCK-PAY-')).toBe(true); // client ref ignored
      expect(p.transactionRef.startsWith('PAY-')).toBe(true);
      expect(p.transactionRef).not.toBe('PAY-FAKE');
    });

    test('wrong order state: paying a cancelled order is rejected', async () => {
      const order = await createPickupOrder();
      const cancel = await request(app).post(`/api/orders/${order.id}/cancel`).set('Authorization', `Bearer ${customerToken}`).send({});
      expect(cancel.statusCode).toBe(200);
      const res = await initiate(order.id);
      expect(res.statusCode).toBe(409);
    });

    test('admin can view payments read-only; customer token cannot reach admin endpoint', async () => {
      const order = await createPickupOrder();
      await initiate(order.id);
      const adminView = await request(app).get(`/api/admin/orders/${order.id}/payment`).set('Authorization', `Bearer ${adminToken}`);
      expect(adminView.statusCode).toBe(200);
      expect(adminView.body.data.payments).toHaveLength(1);
      const custView = await request(app).get(`/api/admin/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerToken}`);
      expect(custView.statusCode).toBe(401);
    });
  });

  // ============================================================
  // Verification via signed webhook → order transition
  // ============================================================
  describe('Verification & order transition', () => {
    test('signed SUCCESS webhook: payment SUCCESS + order COMMITMENT_PAID + exactly one history entry', async () => {
      const order = await createPickupOrder();
      const res = await initiate(order.id);
      const payment = res.body.data.payment;
      const post = webhookPoster(payment, order);

      const wh = await post('SUCCESS');
      expect(wh.statusCode).toBe(200);
      expect(wh.body.event).toBe('PAYMENT_APPLIED');
      expect(wh.body.data.orderStatus).toBe('COMMITMENT_PAID');

      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment.status).toBe('SUCCESS');
      expect(dbPayment.verifiedAt).not.toBeNull();

      const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
      expect(orderAfter.status).toBe('COMMITMENT_PAID');

      const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
      expect(history.map((h) => h.statusTo)).toEqual(['PENDING_PAYMENT', 'COMMITMENT_PAID']);
      expect(history[1].statusFrom).toBe('PENDING_PAYMENT');
      expect(history[1].changedByType).toBe('SYSTEM');
    });

    test('payment FAILED webhook does not mark the order paid; successful retry works', async () => {
      const order = await createPickupOrder();
      const res = await initiate(order.id);
      const payment = res.body.data.payment;
      const post = webhookPoster(payment, order);

      const fail = await post('FAILED');
      expect(fail.statusCode).toBe(200);
      expect(fail.body.event).toBe('PAYMENT_FAILED_RECORDED');
      let dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment.status).toBe('FAILED');
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');

      // retry: initiation creates a FRESH attempt (old one is FAILED)...
      const retry = await initiate(order.id);
      expect(retry.statusCode).toBe(200);
      const retryPayment = retry.body.data.payment;
      expect(retryPayment.id).not.toBe(payment.id);
      expect(retryPayment.status).toBe('PENDING');

      // ...and a successful webhook completes it
      const ok = await webhookPoster(retryPayment, order)('SUCCESS');
      expect(ok.statusCode).toBe(200);
      expect(ok.body.data.orderStatus).toBe('COMMITMENT_PAID');

      const successes = await prisma.payment.count({ where: { orderId: order.id, status: 'SUCCESS' } });
      expect(successes).toBe(1);
      const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
      expect(history.filter((h) => h.statusTo === 'COMMITMENT_PAID')).toHaveLength(1);
    });

    test('mismatched amount / currency / order reference / unknown payment are rejected', async () => {
      const order = await createPickupOrder();
      const res = await initiate(order.id);
      const payment = res.body.data.payment;
      const post = webhookPoster(payment, order);

      const wrongAmount = await post('SUCCESS', { amountUgx: payment.amountUgx - 1 });
      expect(wrongAmount.statusCode).toBe(422); // service-level amount validation
      const wrongCurrency = await post('SUCCESS', { currency: 'USD' });
      expect(wrongCurrency.statusCode).toBe(400); // adapter refuses to normalize non-UGX events
      const wrongOrder = await post('SUCCESS', { orderNumber: 'FB-00000000-000001' });
      expect(wrongOrder.statusCode).toBe(422); // service-level order correlation
      const unknown = await post('SUCCESS', { providerRef: 'MOCK-PAY-does-not-exist' });
      expect(unknown.statusCode).toBe(404);

      // authoritative state untouched by all rejected events
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
      expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING');
    });

    test('cancelled order: late webhook must NOT transition CANCELLED → COMMITMENT_PAID', async () => {
      const order = await createPickupOrder();
      const res = await initiate(order.id);
      const payment = res.body.data.payment;

      const cancel = await request(app).post(`/api/orders/${order.id}/cancel`).set('Authorization', `Bearer ${customerToken}`).send({});
      expect(cancel.statusCode).toBe(200);

      const wh = await webhookPoster(payment, order)('SUCCESS');
      expect([400, 409]).toContain(wh.statusCode);
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('CANCELLED');
      expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).not.toBe('SUCCESS');
      // no COMMITMENT_PAID history after cancellation
      const bad = await prisma.orderStatusHistory.count({ where: { orderId: order.id, statusTo: 'COMMITMENT_PAID' } });
      expect(bad).toBe(0);
    });

    test('client cannot force status via customer endpoints; Phase 5 map stays authoritative after payment', async () => {
      const order = await createPickupOrder();
      const res = await initiate(order.id);
      const payment = res.body.data.payment;
      await webhookPoster(payment, order)('SUCCESS');

      // COMMITMENT_PAID is still customer-cancellable (Phase 5 rules) — but the
      // status field in the body is stripped and can never drive transitions
      const cancelWithStatus = await request(app).post(`/api/orders/${order.id}/cancel`).set('Authorization', `Bearer ${customerToken}`).send({ status: 'COMPLETED' });
      expect(cancelWithStatus.statusCode).toBe(200);
      expect(cancelWithStatus.body.data.order.status).toBe('CANCELLED');

      // re-initiation reports the EXISTING successful payment (§18: never create
      // a second success; the paid history is returned read-only) — but the
      // order itself stays CANCELLED
      const again = await initiate(order.id);
      expect(again.statusCode).toBe(200);
      expect(again.body.data.payment.id).toBe(payment.id);
      expect(again.body.data.payment.status).toBe('SUCCESS');
      expect(again.body.data.reused).toBe(true);
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('CANCELLED');
    }, 20000);

    test('payment amount snapshot: changing product price afterwards does not alter payment amount', async () => {
      const order = await createPickupOrder();
      const commitment = order.pricing.commitmentUgx;
      const res = await initiate(order.id);
      const payment = res.body.data.payment;

      await prisma.product.update({ where: { id: product.id }, data: { priceUgx: 99000 } });

      const wh = await webhookPoster(payment, order)('SUCCESS');
      expect(wh.statusCode).toBe(200);
      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment.amountUgx).toBe(commitment); // order-time authoritative amount
      const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
      expect(orderAfter.commitmentAmount).toBe(commitment);
      expect(orderAfter.status).toBe('COMMITMENT_PAID');

      await prisma.product.update({ where: { id: product.id }, data: { priceUgx: 30000 } });
    });
  });
});
