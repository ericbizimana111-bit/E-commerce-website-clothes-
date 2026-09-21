/**
 * GET /api/payments/return — Flutterwave card-payment redirect relay.
 *
 * After a customer completes (or abandons) card payment on Flutterwave's
 * hosted page, Flutterwave redirects their browser here with query params:
 *   ?status=successful&tx_ref=PAY-…&transaction_id=…
 *
 * The handler looks up the payment by tx_ref, finds the orderId, and
 * redirects the customer to the frontend order page. It is deliberately
 * unauthenticated (the customer's browser reaches it after an external
 * redirect, not a JWT-authenticated API call).
 *
 * Payment application is NOT performed here — the webhook is the canonical
 * result channel. This tests the redirect routing only.
 */

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const bcrypt = require('bcryptjs');

describe('GET /api/payments/return — card payment redirect relay', () => {
  let testUserId = null;
  let testOrderId = null;
  let testTransactionRef = null;

  beforeAll(async () => {
    const hash = await bcrypt.hash('ReturnTest123!', 12);

    const user = await prisma.user.upsert({
      where: { phone: '+256700199001' },
      update: { fullName: 'Return Test User', isActive: true },
      create: {
        fullName: 'Return Test User',
        phone: '+256700199001',
        email: 'return.test@ugamarket.test',
        passwordHash: hash,
        isActive: true,
      },
    });
    testUserId = user.id;

    // Create a minimal order for the lookup test
    const order = await prisma.order.create({
      data: {
        userId: testUserId,
        orderNumber: `FB-RETURN-TEST-${Date.now()}`,
        status: 'PENDING_PAYMENT',
        deliveryType: 'PICKUP_STATION',
        currency: 'UGX',
        itemsSubtotal: 10000,
        deliveryFee: 0,
        totalAmount: 10000,
        commitmentAmount: 3000,
        remainingBalance: 7000,
      },
    });
    testOrderId = order.id;

    // Create a PENDING payment for this order
    testTransactionRef = `PAY-RETURN-TEST-${Date.now()}`;
    await prisma.payment.create({
      data: {
        orderId: testOrderId,
        purpose: 'COMMITMENT',
        paymentType: 'COMMITMENT_ONLINE',
        provider: 'FLUTTERWAVE',
        transactionRef: testTransactionRef,
        amountUgx: 3000,
        currency: 'UGX',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    if (testOrderId) {
      await prisma.payment.deleteMany({ where: { orderId: testOrderId } });
      await prisma.order.deleteMany({ where: { id: testOrderId } });
    }
    if (testUserId) await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  test('redirects to the order page when tx_ref matches a known payment', async () => {
    const res = await request(app).get(`/api/payments/return?status=successful&tx_ref=${testTransactionRef}&transaction_id=12345`);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${env.FRONTEND_URL}/account/orders/${testOrderId}`);
  });

  test('redirects to orders list when tx_ref is not found', async () => {
    const res = await request(app).get('/api/payments/return?status=successful&tx_ref=PAY-UNKNOWN-DOES-NOT-EXIST&transaction_id=99');

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${env.FRONTEND_URL}/account/orders`);
  });

  test('redirects to orders list when tx_ref is omitted', async () => {
    const res = await request(app).get('/api/payments/return?status=cancelled');

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${env.FRONTEND_URL}/account/orders`);
  });

  test('redirects to orders list when all query params are omitted', async () => {
    const res = await request(app).get('/api/payments/return');

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${env.FRONTEND_URL}/account/orders`);
  });

  test('no authentication required — unauthenticated request returns 302, not 401', async () => {
    const res = await request(app).get('/api/payments/return');
    expect(res.statusCode).toBe(302);
    expect(res.statusCode).not.toBe(401);
  });
});
