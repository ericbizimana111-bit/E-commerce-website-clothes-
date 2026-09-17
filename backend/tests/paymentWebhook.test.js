const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const { signMockWebhook } = require('../src/services/paymentProviders/mockProvider');

jest.setTimeout(60000);

/**
 * Phase 6 — Webhook security & idempotency:
 * signature enforcement, payload validation, replay/duplicate protection,
 * and DB-consistent concurrent processing.
 */
describe('Phase 6 Webhook Security & Idempotency', () => {
  let customerToken = null;
  let station = null;
  let category = null;
  let product = null;

  const createdUserIds = [];
  const createdProductIds = [];
  const createdOrderIds = [];

  async function makeCustomer(name) {
    for (let i = 0; i < 5; i++) {
      const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
      const reg = await request(app).post('/api/auth/register').send({ fullName: `${name} ${Date.now()}-${i}`, phone, password: 'HookPass123!' });
      if (reg.statusCode === 409) continue;
      expect(reg.statusCode).toBe(201);
      const id = reg.body.data.user.id;
      createdUserIds.push(id);
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'HookPass123!' });
      return { token: login.body.data.token, id };
    }
    throw new Error('could not create webhook test customer');
  }

  async function createPaidAttempt() {
    // order + PENDING payment attempt; returns { order, payment, post }
    await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerToken}`);
    const add = await request(app).post('/api/cart/items').set('Authorization', `Bearer ${customerToken}`).send({ productId: product.id, quantity: 1 });
    expect(add.statusCode).toBe(201);
    const o = await request(app).post('/api/orders').set('Authorization', `Bearer ${customerToken}`).send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
    expect(o.statusCode).toBe(201);
    const order = o.body.data.order;
    createdOrderIds.push(order.id);
    const pay = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerToken}`).send({});
    expect(pay.statusCode).toBe(200);
    const payment = pay.body.data.payment;

    const post = (outcome, overrides = {}) => {
      const body = {
        providerRef: overrides.providerRef || payment.providerRef,
        orderNumber: overrides.orderNumber !== undefined ? overrides.orderNumber : order.orderNumber,
        amountUgx: overrides.amountUgx !== undefined ? overrides.amountUgx : payment.amountUgx,
        currency: overrides.currency || 'UGX',
        outcome,
      };
      const raw = JSON.stringify(body);
      const headers = overrides.signature === null ? {} : { 'x-ugafresh-signature': overrides.signature || signMockWebhook(raw) };
      return request(app).post('/api/payments/webhook').set(headers).send(raw);
    };
    return { order, payment, post };
  }

  beforeAll(async () => {
    const a = await makeCustomer('Hook Customer');
    customerToken = a.token;
    station = await prisma.pickupStation.findFirst({ where: { isActive: true } });
    category = await prisma.category.findFirst();
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'hook-test-product-' + Date.now(),
        priceUgx: 20000,
        stockQuantity: 40,
        unit: 'piece',
        isActive: true,
        nameEn: 'Hook Test Product',
        translations: { create: [{ language: 'EN', name: 'Hook Test Product' }] },
      },
    });
    createdProductIds.push(product.id);
  });

  afterAll(async () => {
    for (const oid of createdOrderIds) {
      await prisma.auditLog.deleteMany({ where: { entityId: oid } });
      await prisma.payment.deleteMany({ where: { orderId: oid } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
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
    for (const uid of createdUserIds) {
      await prisma.cartItem.deleteMany({ where: { cart: { userId: uid } } });
      await prisma.cart.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    await prisma.$disconnect();
  });

  describe('Signature enforcement', () => {
    test('valid signature → accepted and applied', async () => {
      const { order, post } = await createPaidAttempt();
      const wh = await post('SUCCESS');
      expect(wh.statusCode).toBe(200);
      expect(wh.body.event).toBe('PAYMENT_APPLIED');
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('COMMITMENT_PAID');
    });

    test('invalid signature → rejected 400, no state change', async () => {
      const { order, payment, post } = await createPaidAttempt();
      const wh = await post('SUCCESS', { signature: 'deadbeef'.repeat(8) });
      expect(wh.statusCode).toBe(400);
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
      expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING');
    });

    test('missing signature → rejected 400', async () => {
      const { order, post } = await createPaidAttempt();
      const wh = await post('SUCCESS', { signature: null });
      expect(wh.statusCode).toBe(400);
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
    });

    test('tampered payload (signed then modified) → rejected', async () => {
      const { post } = await createPaidAttempt();
      // sign a small amount, then send a large one under that signature
      const forged = JSON.stringify({ providerRef: 'x', orderNumber: 'y', amountUgx: 1, currency: 'UGX', outcome: 'SUCCESS' });
      const signature = signMockWebhook(forged);
      const wh = await post('SUCCESS', { amountUgx: 999999999, signature });
      expect(wh.statusCode).toBe(400);
    });

    test('malformed payload → rejected', async () => {
      const wh = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-ugafresh-signature', signMockWebhook('{"broken"'))
        .send('{"broken"');
      expect(wh.statusCode).toBe(400);
    });

    test('webhook rejects JWT-authenticated access pattern: no customer/admin token required or honored', async () => {
      const { post } = await createPaidAttempt();
      // Even WITH an arbitrary bearer token present, invalid signature still rejected
      const wh = await request(app)
        .post('/api/payments/webhook')
        .set('Authorization', 'Bearer anything.invalid.token')
        .set('x-ugafresh-signature', 'nope')
        .send({ providerRef: 'MOCK-PAY-x', orderNumber: 'FB-1', amountUgx: 1, currency: 'UGX', outcome: 'SUCCESS' });
      expect(wh.statusCode).toBe(400);
    });
  });

  describe('Event validation', () => {
    test('unknown payment reference → 404 with rejection audit', async () => {
      const { order, post } = await createPaidAttempt();
      const wh = await post('SUCCESS', { providerRef: 'MOCK-PAY-unknown-ref' });
      expect(wh.statusCode).toBe(404);
      const audits = await prisma.auditLog.findMany({ where: { action: 'PAYMENT_WEBHOOK_REJECTED' }, orderBy: { createdAt: 'desc' }, take: 1 });
      expect(audits[0].details.reason).toBe('UNKNOWN_PAYMENT');
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
    });

    test('wrong amount → 422; wrong currency → 400; wrong order → 422', async () => {
      const { payment, post } = await createPaidAttempt();
      expect((await post('SUCCESS', { amountUgx: payment.amountUgx + 500 })).statusCode).toBe(422);
      expect((await post('SUCCESS', { currency: 'KES' })).statusCode).toBe(400);
      expect((await post('SUCCESS', { orderNumber: 'FB-99999999-000001' })).statusCode).toBe(422);
    });

    test('failed webhook records FAILED payment, order remains PENDING_PAYMENT', async () => {
      const { order, payment, post } = await createPaidAttempt();
      const wh = await post('FAILED');
      expect(wh.statusCode).toBe(200);
      expect(wh.body.event).toBe('PAYMENT_FAILED_RECORDED');
      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment.status).toBe('FAILED');
      expect(dbPayment.resultCode).not.toBe('NONE');
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
    });

    test('success on an already-FAILED attempt cannot resurrect it', async () => {
      const { order, payment, post } = await createPaidAttempt();
      await post('FAILED');
      const wh = await post('SUCCESS'); // same attempt, now FAILED
      expect([200, 409]).toContain(wh.statusCode); // ignored (200) — never verified
      expect(wh.body.event === 'IGNORED' || wh.body.event === 'PAYMENT_APPLIED' ? wh.body.event === 'IGNORED' : true).toBe(true);
      expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('FAILED');
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
    });
  });

  describe('Idempotency / replay protection', () => {
    test('exact same SUCCESS webhook delivered twice → one payment success, one transition, one history entry', async () => {
      const { order, payment, post } = await createPaidAttempt();
      const first = await post('SUCCESS');
      expect(first.statusCode).toBe(200);
      expect(first.body.event).toBe('PAYMENT_APPLIED');

      const replay = await post('SUCCESS');
      expect(replay.statusCode).toBe(200);
      expect(replay.body.event).toBe('ALREADY_PROCESSED');

      expect(await prisma.payment.count({ where: { orderId: order.id, status: 'SUCCESS' } })).toBe(1);
      const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id, statusTo: 'COMMITMENT_PAID' } });
      expect(history).toHaveLength(1);

      const appliedAudits = await prisma.auditLog.count({ where: { action: 'COMMITMENT_PAYMENT_APPLIED', entityId: payment.id } });
      expect(appliedAudits).toBe(1);
    });

    test('concurrent SUCCESS webhooks for one attempt → exactly one success, one transition (DB-backed)', async () => {
      const { order, payment, post } = await createPaidAttempt();

      const results = await Promise.all([
        post('SUCCESS'),
        post('SUCCESS'),
        post('SUCCESS'),
        post('SUCCESS'),
      ]);

      const statuses = results.map((r) => r.status);
      expect(statuses.every((s) => [200, 409].includes(s))).toBe(true);
      const applied = results.filter((r) => r.body?.event === 'PAYMENT_APPLIED');
      expect(applied).toHaveLength(1); // transition happened EXACTLY once

      expect(await prisma.payment.count({ where: { orderId: order.id, status: 'SUCCESS' } })).toBe(1);
      expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, statusTo: 'COMMITMENT_PAID' } })).toBe(1);
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('COMMITMENT_PAID');

      const appliedAudits = await prisma.auditLog.count({ where: { action: 'COMMITMENT_PAYMENT_APPLIED', entityId: payment.id } });
      expect(appliedAudits).toBe(1);
    });

    test('concurrent FAILED + SUCCESS webhooks → no contradictory financial state', async () => {
      const { order, payment, post } = await createPaidAttempt();
      const results = await Promise.all([post('FAILED'), post('SUCCESS'), post('SUCCESS')]);
      expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);

      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      // Either the success won (SUCCESS + COMMITMENT_PAID) or the failure won
      // (FAILED + PENDING_PAYMENT) — but never a mix of SUCCESS + PENDING order
      // without transition, and never both.
      const orderStatus = (await prisma.order.findUnique({ where: { id: order.id } })).status;
      expect(['PENDING_PAYMENT', 'COMMITMENT_PAID']).toContain(orderStatus);
      expect(await prisma.payment.count({ where: { orderId: order.id, status: 'SUCCESS' } })).toBeLessThanOrEqual(1);
      if (dbPayment.status === 'SUCCESS') {
        expect(orderStatus).toBe('COMMITMENT_PAID');
        expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, statusTo: 'COMMITMENT_PAID' } })).toBe(1);
      } else {
        expect(orderStatus).toBe('PENDING_PAYMENT');
      }
    });
  });
});
