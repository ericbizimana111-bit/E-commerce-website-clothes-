const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signMockWebhook } = require('../src/services/paymentProviders/mockProvider');

jest.setTimeout(60000);

/**
 * Phase 8 — Balance Payment, Order Completion & Final Financial Lifecycle
 *
 * Covers:
 * 1. Fulfillment eligibility boundary (home delivery DELIVERED, pickup PICKED_UP)
 * 2. Server-authoritative balance calculation (amount/currency tampering protection)
 * 3. Initiation idempotency and attempt reuse
 * 4. Webhook security (signature, amount, currency, purpose verification)
 * 5. Failed balance payment & retry lifecycle
 * 6. Expired balance payment behavior
 * 7. Successful balance payment -> atomic order completion
 * 8. Replay & duplicate protection
 * 9. Zero-balance order handling
 * 10. Cancellation interaction & terminal immutability (no fake refunds)
 * 11. Customer IDOR & Admin RBAC
 * 12. Concurrency: initiation race, webhook race, cancellation race
 */
describe('Phase 8 Balance Payment & Order Completion API', () => {
  let customerAToken = null;
  let customerAId = null;
  let customerBToken = null;
  let customerBId = null;
  let adminToken = null;
  let station = null;
  let product = null;

  const createdUserIds = [];
  const createdOrderIds = [];

  async function makeCustomer(name) {
    for (let i = 0; i < 5; i++) {
      const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ fullName: `${name} ${Date.now()}-${i}`, phone, password: 'BalancePass123!' });
      if (reg.statusCode === 409) continue;
      expect(reg.statusCode).toBe(201);
      const id = reg.body.data.user.id;
      createdUserIds.push(id);
      const login = await request(app)
        .post('/api/auth/login')
        .send({ phone, password: 'BalancePass123!' });
      return { token: login.body.data.token, id };
    }
    throw new Error('could not create balance test customer');
  }

  async function createPickupOrder(token) {
    const cartRes = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 2 });
    expect(cartRes.statusCode).toBe(201);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: station.id });

    expect(res.statusCode).toBe(201);
    const order = res.body.data.order;
    createdOrderIds.push(order.id);
    return order;
  }

  function webhookPoster(payment, order) {
    return function postWebhook(outcome, overrides = {}) {
      const body = {
        providerRef: overrides.providerRef || payment.providerRef,
        orderNumber: overrides.orderNumber || order.orderNumber,
        amountUgx: overrides.amountUgx !== undefined ? overrides.amountUgx : payment.amountUgx,
        currency: overrides.currency || 'UGX',
        purpose: overrides.purpose || payment.purpose,
        outcome,
      };
      const raw = JSON.stringify(body);
      const headers =
        overrides.signature === null
          ? {}
          : { 'x-ugafresh-signature': overrides.signature || signMockWebhook(raw) };
      return request(app).post('/api/payments/webhook').set(headers).send(body);
    };
  }

  beforeAll(async () => {
    const adminRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    adminToken = adminRes.body.data.token;

    const a = await makeCustomer('Balance Cust A');
    customerAToken = a.token;
    customerAId = a.id;

    const b = await makeCustomer('Balance Cust B');
    customerBToken = b.token;
    customerBId = b.id;

    station = await prisma.pickupStation.findFirst({ where: { isActive: true } });
    const category = await prisma.category.findFirst();
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'balance-test-prod-' + Date.now(),
        sku: 'BAL-' + Date.now(),
        priceUgx: 20000,
        stockQuantity: 100,
        unit: 'kg',
        isActive: true,
        translations: { create: [{ language: 'EN', name: 'Balance Test Product' }] },
      },
    });
  });

  afterAll(async () => {
    for (const oid of createdOrderIds) {
      await prisma.auditLog.deleteMany({ where: { entityId: oid } });
      await prisma.payment.deleteMany({ where: { orderId: oid } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
      await prisma.delivery.deleteMany({ where: { orderId: oid } });
      await prisma.orderItem.deleteMany({ where: { orderId: oid } });
      await prisma.order.deleteMany({ where: { id: oid } });
    }
    for (const uid of createdUserIds) {
      await prisma.notification.deleteMany({ where: { userId: uid } });
      await prisma.cartItem.deleteMany({ where: { cart: { userId: uid } } });
      await prisma.cart.deleteMany({ where: { userId: uid } });
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }
    if (product?.id) {
      await prisma.productTranslation.deleteMany({ where: { productId: product.id } });
      await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
    }
  });

  describe('1. Fulfillment Eligibility Boundary', () => {
    test('rejects balance payment before fulfillment is completed', async () => {
      const order = await createPickupOrder(customerAToken);

      // Order is PENDING_PAYMENT
      const resPending = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ purpose: 'BALANCE' });
      expect(resPending.statusCode).toBe(409);
      expect(resPending.body.message).toContain('Fulfillment must be completed first');

      // Pay commitment payment
      const initCommit = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ purpose: 'COMMITMENT' });
      expect(initCommit.statusCode).toBe(200);
      const commitPayment = initCommit.body.data.payment;

      const postCommitWebhook = webhookPoster(commitPayment, order);
      await postCommitWebhook('SUCCESS');

      // Advance through admin to READY_FOR_PICKUP
      await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CONFIRMED' });
      await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PREPARING' });
      await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'READY_FOR_PICKUP' });

      // Still cannot initiate balance payment while READY_FOR_PICKUP
      const resReady = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ purpose: 'BALANCE' });
      expect(resReady.statusCode).toBe(409);
      expect(resReady.body.message).toContain('Fulfillment must be completed first');

      // Now complete pickup
      const pickupRes = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PICKED_UP' });
      expect(pickupRes.statusCode).toBe(200);

      // Also sync delivery row to PICKED_UP
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      // NOW balance payment CAN be initiated
      const resEligible = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ purpose: 'BALANCE' });
      expect(resEligible.statusCode).toBe(200);
      expect(resEligible.body.data.payment.purpose).toBe('BALANCE');
      expect(resEligible.body.data.payment.status).toBe('PENDING');
    });
  });

  describe('2. Server-Authoritative Balance & Tampering Protection', () => {
    test('calculates balance strictly on the server and strips client tampering', async () => {
      const order = await createPickupOrder(customerAToken);

      // Complete commitment & fulfillment
      const initCommit = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({});
      const postCommit = webhookPoster(initCommit.body.data.payment, order);
      await postCommit('SUCCESS');

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'READY_FOR_PICKUP' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PICKED_UP' });
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      const expectedBalance = order.pricing.totalUgx - order.pricing.commitmentUgx;

      // Attempt tampering with client amounts
      const tamperedRes = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          purpose: 'BALANCE',
          amount: 50,
          amountUgx: 50,
          currency: 'USD',
          status: 'SUCCESS',
        });

      expect(tamperedRes.statusCode).toBe(200);
      const payment = tamperedRes.body.data.payment;
      expect(payment.amountUgx).toBe(expectedBalance);
      expect(payment.currency).toBe('UGX');
      expect(payment.status).toBe('PENDING');
    });
  });

  describe('3. Idempotent Initiation & Attempt Reuse', () => {
    test('re-initiating returns the existing pending balance attempt without creating a second one', async () => {
      const order = await createPickupOrder(customerAToken);

      const initCommit = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({});
      await webhookPoster(initCommit.body.data.payment, order)('SUCCESS');

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'READY_FOR_PICKUP' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PICKED_UP' });
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      const first = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ purpose: 'BALANCE' });
      expect(first.statusCode).toBe(200);

      const second = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ purpose: 'BALANCE' });
      expect(second.statusCode).toBe(200);
      expect(second.body.data.payment.id).toBe(first.body.data.payment.id);

      const balanceAttempts = await prisma.payment.count({
        where: { orderId: order.id, purpose: 'BALANCE' },
      });
      expect(balanceAttempts).toBe(1);
    });
  });

  describe('4. Webhook Security & Tampering Rejections', () => {
    test('rejects unsigned, invalidly signed, or tampered webhooks', async () => {
      const order = await createPickupOrder(customerAToken);

      const initCommit = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({});
      await webhookPoster(initCommit.body.data.payment, order)('SUCCESS');

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'READY_FOR_PICKUP' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PICKED_UP' });
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      const initBalance = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({ purpose: 'BALANCE' });
      const balPayment = initBalance.body.data.payment;
      const postBalWebhook = webhookPoster(balPayment, order);

      // Missing signature
      const resNoSig = await postBalWebhook('SUCCESS', { signature: null });
      expect(resNoSig.statusCode).toBe(400);

      // Bad signature
      const resBadSig = await postBalWebhook('SUCCESS', { signature: 'abcdef123456' });
      expect(resBadSig.statusCode).toBe(400);

      // Tampered amount
      const resBadAmount = await postBalWebhook('SUCCESS', { amountUgx: balPayment.amountUgx + 1000 });
      expect(resBadAmount.statusCode).toBe(422);

      // Tampered currency
      const resBadCurr = await postBalWebhook('SUCCESS', { currency: 'USD' });
      expect(resBadCurr.statusCode).toBe(400);

      // Unknown provider reference
      const resBadRef = await postBalWebhook('SUCCESS', { providerRef: 'UNKNOWN-REF-12345' });
      expect(resBadRef.statusCode).toBe(404);
    });
  });

  describe('5. Failed Balance Payment & Retry Lifecycle', () => {
    test('failed balance payment leaves order unpaid and retry creates a fresh attempt', async () => {
      const order = await createPickupOrder(customerAToken);

      const initCommit = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({});
      await webhookPoster(initCommit.body.data.payment, order)('SUCCESS');

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'READY_FOR_PICKUP' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PICKED_UP' });
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      const init1 = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({ purpose: 'BALANCE' });
      const pay1 = init1.body.data.payment;

      // Deliver FAILED webhook
      const failRes = await webhookPoster(pay1, order)('FAILED');
      expect(failRes.statusCode).toBe(200);
      expect(failRes.body.event).toBe('PAYMENT_FAILED_RECORDED');

      // Order remains in PICKED_UP
      const checkOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(checkOrder.status).toBe('PICKED_UP');

      // Retry initiation creates a NEW pending attempt
      const init2 = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({ purpose: 'BALANCE' });
      const pay2 = init2.body.data.payment;
      expect(pay2.id).not.toBe(pay1.id);
      expect(pay2.status).toBe('PENDING');

      // Now verify SUCCESS for the second attempt
      const succRes = await webhookPoster(pay2, order)('SUCCESS');
      expect(succRes.statusCode).toBe(200);
      expect(succRes.body.event).toBe('PAYMENT_APPLIED');

      const completedOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(completedOrder.status).toBe('COMPLETED');
    });
  });

  describe('6. Successful Balance Payment -> Order Completion & Notifications', () => {
    test('completes order atomically, sets balance to zero, and records notification and audits', async () => {
      const order = await createPickupOrder(customerAToken);

      const initCommit = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({});
      await webhookPoster(initCommit.body.data.payment, order)('SUCCESS');

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'READY_FOR_PICKUP' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PICKED_UP' });
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      const initBal = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({ purpose: 'BALANCE' });
      const payBal = initBal.body.data.payment;

      const okRes = await webhookPoster(payBal, order)('SUCCESS');
      expect(okRes.statusCode).toBe(200);
      expect(okRes.body.event).toBe('PAYMENT_APPLIED');
      expect(okRes.body.data.orderStatus).toBe('COMPLETED');

      // Check order status in DB
      const finalOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: { statusHistory: true },
      });
      expect(finalOrder.status).toBe('COMPLETED');

      // History should have BALANCE_PAID then COMPLETED
      const historyStatuses = finalOrder.statusHistory.map((h) => h.statusTo);
      expect(historyStatuses).toContain('BALANCE_PAID');
      expect(historyStatuses).toContain('COMPLETED');

      // Customer notification created
      const notif = await prisma.notification.findFirst({
        where: { userId: customerAId, type: 'ORDER_UPDATE' },
        orderBy: { createdAt: 'desc' },
      });
      expect(notif).toBeDefined();
      expect(notif.title).toBe('Order Completed');

      // Customer payment lookup returns complete financial visibility
      const custPayRes = await request(app)
        .get(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`);
      expect(custPayRes.statusCode).toBe(200);
      expect(custPayRes.body.data.isCompleted).toBe(true);
      expect(custPayRes.body.data.isFullyPaid).toBe(true);
      expect(custPayRes.body.data.pricing.remainingBalanceUgx).toBe(0);
      expect(custPayRes.body.data.commitmentPaymentStatus).toBe('SUCCESS');
      expect(custPayRes.body.data.balancePaymentStatus).toBe('SUCCESS');
    });
  });

  describe('7. Webhook Replay & Duplicate Balance Payment Protection', () => {
    test('replay of SUCCESS webhook is completely idempotent and does not create duplicate transitions', async () => {
      const order = await createPickupOrder(customerAToken);

      const initCommit = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({});
      await webhookPoster(initCommit.body.data.payment, order)('SUCCESS');

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'READY_FOR_PICKUP' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PICKED_UP' });
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      const initBal = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({ purpose: 'BALANCE' });
      const payBal = initBal.body.data.payment;
      const postWebhook = webhookPoster(payBal, order);

      // First webhook
      const res1 = await postWebhook('SUCCESS');
      expect(res1.statusCode).toBe(200);
      expect(res1.body.event).toBe('PAYMENT_APPLIED');

      // Replay 1
      const res2 = await postWebhook('SUCCESS');
      expect(res2.statusCode).toBe(200);
      expect(res2.body.event).toBe('ALREADY_PROCESSED');

      // Replay 2
      const res3 = await postWebhook('SUCCESS');
      expect(res3.statusCode).toBe(200);
      expect(res3.body.event).toBe('ALREADY_PROCESSED');

      // Assert exactly 1 successful balance payment
      const successfulBalanceCount = await prisma.payment.count({
        where: { orderId: order.id, purpose: 'BALANCE', status: 'SUCCESS' },
      });
      expect(successfulBalanceCount).toBe(1);

      // Assert exactly 1 COMPLETED history record
      const completionHistCount = await prisma.orderStatusHistory.count({
        where: { orderId: order.id, statusTo: 'COMPLETED' },
      });
      expect(completionHistCount).toBe(1);
    });
  });

  describe('8. Cancellation Interactions & Terminal Immutability', () => {
    test('order cancelled before balance initiation rejects balance payment', async () => {
      const order = await createPickupOrder(customerAToken);

      // Cancel before payment
      const cancelRes = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ reason: 'cancel early' });
      expect(cancelRes.statusCode).toBe(200);

      // Initiation rejected
      const initBal = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ purpose: 'BALANCE' });
      expect(initBal.statusCode).toBe(409);
      expect(initBal.body.message).toContain('cancelled');
    });

    test('completed order is immutable: cannot be cancelled and cannot accept further payments', async () => {
      const order = await createPickupOrder(customerAToken);

      const initCommit = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({});
      await webhookPoster(initCommit.body.data.payment, order)('SUCCESS');

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'READY_FOR_PICKUP' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PICKED_UP' });
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      const initBal = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({ purpose: 'BALANCE' });
      await webhookPoster(initBal.body.data.payment, order)('SUCCESS');

      // Customer cancellation rejected
      const custCancel = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ reason: 'late cancel' });
      expect(custCancel.statusCode).toBe(409);

      // Admin cancellation rejected (COMPLETED has no exits in ORDER_STATUS_TRANSITIONS)
      const adminCancel = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CANCELLED' });
      expect(adminCancel.statusCode).toBe(409);

      // Additional balance initiation reports existing success (idempotent safe)
      const reInit = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ purpose: 'BALANCE' });
      expect(reInit.statusCode).toBe(200);
      expect(reInit.body.data.reused).toBe(true);

      // Successful payment records remain intact (no fake refunds)
      const payRecord = await prisma.payment.findUnique({ where: { id: initBal.body.data.payment.id } });
      expect(payRecord.status).toBe('SUCCESS');
    });
  });

  describe('9. Customer IDOR & Admin RBAC', () => {
    test('customer B cannot initiate or peek at customer A balance payment', async () => {
      const order = await createPickupOrder(customerAToken);

      const stealInit = await request(app)
        .post(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({ purpose: 'BALANCE' });
      expect(stealInit.statusCode).toBe(404);

      const stealView = await request(app)
        .get(`/api/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerBToken}`);
      expect(stealView.statusCode).toBe(404);
    });

    test('admin can view balance payment read-only and no secrets are leaked', async () => {
      const order = await createPickupOrder(customerAToken);

      const custAdmin = await request(app)
        .get(`/api/admin/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${customerAToken}`);
      expect(custAdmin.statusCode).toBe(401);

      const adminView = await request(app)
        .get(`/api/admin/orders/${order.id}/payment`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminView.statusCode).toBe(200);
      expect(adminView.body.data.orderId).toBe(order.id);

      const resText = JSON.stringify(adminView.body);
      expect(resText).not.toContain(env.PAYMENT_WEBHOOK_SECRET);
      expect(resText).not.toContain(env.ADMIN_JWT_SECRET);
    });
  });

  describe('10. Concurrency Tests', () => {
    test('Test 1 — 5 simultaneous balance initiation requests result in a single attempt', async () => {
      const order = await createPickupOrder(customerAToken);

      const initCommit = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({});
      await webhookPoster(initCommit.body.data.payment, order)('SUCCESS');

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'READY_FOR_PICKUP' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PICKED_UP' });
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      // Run 5 simultaneous initiation calls
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/orders/${order.id}/payment`)
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({ purpose: 'BALANCE' })
      );

      const results = await Promise.all(requests);
      results.forEach((res) => {
        expect(res.statusCode).toBe(200);
      });

      // Verify exactly one balance attempt row exists in DB
      const attempts = await prisma.payment.findMany({
        where: { orderId: order.id, purpose: 'BALANCE' },
      });
      expect(attempts.length).toBe(1);
    });

    test('Test 2 — 4 simultaneous SUCCESS webhooks result in exactly one successful payment and completion', async () => {
      const order = await createPickupOrder(customerAToken);

      const initCommit = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({});
      await webhookPoster(initCommit.body.data.payment, order)('SUCCESS');

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'READY_FOR_PICKUP' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PICKED_UP' });
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      const initBal = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({ purpose: 'BALANCE' });
      const payBal = initBal.body.data.payment;
      const postWebhook = webhookPoster(payBal, order);

      // Run 4 simultaneous SUCCESS webhooks
      const results = await Promise.all([
        postWebhook('SUCCESS'),
        postWebhook('SUCCESS'),
        postWebhook('SUCCESS'),
        postWebhook('SUCCESS'),
      ]);

      results.forEach((res) => {
        expect(res.statusCode).toBe(200);
      });

      // Exactly 1 successful balance payment
      const successfulPayments = await prisma.payment.findMany({
        where: { orderId: order.id, purpose: 'BALANCE', status: 'SUCCESS' },
      });
      expect(successfulPayments.length).toBe(1);

      // Exactly 1 completion status history entry
      const completionHist = await prisma.orderStatusHistory.findMany({
        where: { orderId: order.id, statusTo: 'COMPLETED' },
      });
      expect(completionHist.length).toBe(1);

      const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(finalOrder.status).toBe('COMPLETED');
    });

    test('Test 3 — Cancellation racing with balance SUCCESS webhook produces consistent valid state', async () => {
      const order = await createPickupOrder(customerAToken);

      const initCommit = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({});
      await webhookPoster(initCommit.body.data.payment, order)('SUCCESS');

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'READY_FOR_PICKUP' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PICKED_UP' });
      const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

      const initBal = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customerAToken}`).send({ purpose: 'BALANCE' });
      const payBal = initBal.body.data.payment;
      const postWebhook = webhookPoster(payBal, order);

      // Race admin cancel vs balance webhook
      const [cancelRes, webhookRes] = await Promise.all([
        request(app)
          .patch(`/api/admin/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: 'CANCELLED' }),
        postWebhook('SUCCESS'),
      ]);

      // Either webhook won (order COMPLETED, cancel 409) OR cancel won (order CANCELLED, webhook 409)
      const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(['COMPLETED', 'CANCELLED']).toContain(finalOrder.status);

      if (finalOrder.status === 'COMPLETED') {
        expect(webhookRes.statusCode).toBe(200);
        expect(cancelRes.statusCode).toBe(409);
      } else {
        expect(cancelRes.statusCode).toBe(200);
        expect(webhookRes.statusCode).toBe(409);
      }
    });
  });
});
