const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signMockWebhook } = require('../src/services/paymentProviders/mockProvider');

jest.setTimeout(60000);

/**
 * Phase 6 — Payment/order integrity:
 * database-enforced uniqueness, concurrent initiation, lazy expiration,
 * cancellation/payment interaction, response redaction.
 */
describe('Phase 6 Payment Integrity & Concurrency', () => {
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
      const reg = await request(app).post('/api/auth/register').send({ fullName: `${name} ${Date.now()}-${i}`, phone, password: 'IntPass123!' });
      if (reg.statusCode === 409) continue;
      expect(reg.statusCode).toBe(201);
      const id = reg.body.data.user.id;
      createdUserIds.push(id);
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'IntPass123!' });
      return { token: login.body.data.token, id };
    }
    throw new Error('could not create integrity test customer');
  }

  async function createPendingAttempt() {
    await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerToken}`);
    const add = await request(app).post('/api/cart/items').set('Authorization', `Bearer ${customerToken}`).send({ productId: product.id, quantity: 1 });
    expect(add.statusCode).toBe(201);
    const o = await request(app).post('/api/orders').set('Authorization', `Bearer ${customerToken}`).send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });
    expect(o.statusCode).toBe(201);
    const order = o.body.data.order;
    createdOrderIds.push(order.id);
    const pay = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerToken}`).send({});
    expect(pay.statusCode).toBe(200);
    return { order, payment: pay.body.data.payment };
  }

  function postWebhook(order, payment, outcome, overrides = {}) {
    const body = {
      providerRef: overrides.providerRef || payment.providerRef,
      orderNumber: order.orderNumber,
      amountUgx: payment.amountUgx,
      currency: 'UGX',
      outcome,
    };
    const raw = JSON.stringify(body);
    return request(app).post('/api/payments/webhook').set('x-ugafresh-signature', signMockWebhook(raw)).send(raw);
  }

  beforeAll(async () => {
    const a = await makeCustomer('Integrity Customer');
    customerToken = a.token;
    station = await prisma.pickupStation.findFirst({ where: { isActive: true } });
    category = await prisma.category.findFirst();
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'integrity-test-product-' + Date.now(),
        priceUgx: 25000,
        stockQuantity: 30,
        unit: 'piece',
        isActive: true,
        nameEn: 'Integrity Test Product',
        translations: { create: [{ language: 'EN', name: 'Integrity Test Product' }] },
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
    for (const uid of createdUserIds) {
      await prisma.cartItem.deleteMany({ where: { cart: { userId: uid } } });
      await prisma.cart.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    await prisma.$disconnect();
  });

  describe('Database-enforced invariants', () => {
    test('partial unique index: a second SUCCESS commitment payment for one order is impossible at the DB level', async () => {
      const { order, payment } = await createPendingAttempt();
      await postWebhook(order, payment, 'SUCCESS');
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('COMMITMENT_PAID');

      // Bypass the service entirely and try to insert a second SUCCESS row
      await expect(
        prisma.payment.create({
          data: {
            orderId: order.id,
            purpose: 'COMMITMENT',
            paymentType: 'COMMITMENT_ONLINE',
            provider: 'MOCK',
            transactionRef: 'PAY-direct-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
            providerRef: 'MOCK-PAY-direct-' + Date.now(),
            amountUgx: payment.amountUgx,
            currency: 'UGX',
            status: 'SUCCESS',
          },
        })
      ).rejects.toMatchObject({ code: 'P2002' }); // unique violation
    });

    test('provider (provider, providerRef) uniqueness: one event can never map to two payments', async () => {
      const { order, payment } = await createPendingAttempt();
      await expect(
        prisma.payment.create({
          data: {
            orderId: order.id,
            purpose: 'COMMITMENT',
            paymentType: 'COMMITMENT_ONLINE',
            provider: 'MOCK',
            transactionRef: 'PAY-clash-' + Date.now(),
            providerRef: payment.providerRef, // same provider ref as existing attempt
            amountUgx: payment.amountUgx,
            currency: 'UGX',
            status: 'PENDING',
          },
        })
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('Concurrency', () => {
    test('concurrent payment initiations for one order reuse ONE attempt (no duplicates)', async () => {
      const { order, payment } = await createPendingAttempt();
      const [r1, r2, r3] = await Promise.all([
        request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerToken}`).send({}),
        request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerToken}`).send({}),
        request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerToken}`).send({}),
      ]);
      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);
      expect(r3.statusCode).toBe(200);
      const ids = new Set([r1.body.data.payment.id, r2.body.data.payment.id, r3.body.data.payment.id]);
      expect(ids.size).toBe(1);
      expect(ids.has(payment.id)).toBe(true);
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    });
  });

  describe('Expiration', () => {
    test('expired attempt is swept on next initiation; new attempt created; expired cannot be verified', async () => {
      const { order, payment } = await createPendingAttempt();

      // force expiry
      await prisma.payment.update({ where: { id: payment.id }, data: { expiresAt: new Date(Date.now() - 60 * 1000) } });

      // webhook for the EXPIRED attempt arrives before any re-initiation:
      // it must be ignored, never verified
      const late = await postWebhook(order, payment, 'SUCCESS');
      expect(late.statusCode).toBe(200);
      expect(late.body.event).toBe('IGNORED');
      expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('EXPIRED');
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');

      // next initiation sweeps and creates a fresh attempt
      const retry = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerToken}`).send({});
      expect(retry.statusCode).toBe(200);
      const fresh = retry.body.data.payment;
      expect(fresh.id).not.toBe(payment.id);
      expect(fresh.status).toBe('PENDING');
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);

      // fresh attempt completes normally
      const wh = await postWebhook(order, fresh, 'SUCCESS');
      expect(wh.statusCode).toBe(200);
      expect(wh.body.event).toBe('PAYMENT_APPLIED');
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('COMMITMENT_PAID');
      expect(await prisma.payment.count({ where: { orderId: order.id, status: 'SUCCESS' } })).toBe(1);
    });
  });

  describe('Cancellation × payment interaction', () => {
    test('cancel after COMMITMENT_PAID: order CANCELLED, payment preserved, no fake refund, stock restored once', async () => {
      const stockBefore = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;
      const { order, payment } = await createPendingAttempt();
      const stockAfterOrder = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;
      expect(stockAfterOrder).toBe(stockBefore - 1);

      const wh = await postWebhook(order, payment, 'SUCCESS');
      expect(wh.statusCode).toBe(200);

      const cancel = await request(app).post(`/api/orders/${order.id}/cancel`).set('Authorization', `Bearer ${customerToken}`).send({ reason: 'changed my mind' });
      expect(cancel.statusCode).toBe(200);
      expect(cancel.body.data.order.status).toBe('CANCELLED');

      // payment record preserved — NOT mutated into a refund
      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment.status).toBe('SUCCESS');
      expect(dbPayment.verifiedAt).not.toBeNull();

      // full lifecycle history, no refund/fake states invented
      const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
      expect(history.map((h) => h.statusTo)).toEqual(['PENDING_PAYMENT', 'COMMITMENT_PAID', 'CANCELLED']);

      // stock restored exactly once by the cancellation
      expect((await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity).toBe(stockBefore);

      // re-cancelling impossible
      const again = await request(app).post(`/api/orders/${order.id}/cancel`).set('Authorization', `Bearer ${customerToken}`).send({});
      expect(again.statusCode).toBe(409);
    });
  });

  describe('Response safety', () => {
    test('payment responses never expose raw payload, secrets, or internal fields', async () => {
      const { order, payment } = await createPendingAttempt();
      const wh = await postWebhook(order, payment, 'SUCCESS');

      for (const body of [wh.body]) {
        const s = JSON.stringify(body);
        expect(s).not.toContain(env.PAYMENT_WEBHOOK_SECRET);
        expect(s).not.toContain('providerEvent');
      }

      const lookup = await request(app).get(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerToken}`);
      expect(lookup.statusCode).toBe(200);
      const s = JSON.stringify(lookup.body);
      expect(s).not.toContain(env.PAYMENT_WEBHOOK_SECRET);
      expect(s).not.toContain('payload');
      const p = lookup.body.data.payments[0];
      for (const key of ['payload', 'failureMessage', 'resultCode']) {
        if (p[key] === null) delete p[key];
      }
      expect(p).not.toHaveProperty('passwordHash');
    });
  });
});
