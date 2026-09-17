/* Phase 6 HTTP Smoke Tests — commitment payment boundary over real HTTP. */
const BASE = 'http://localhost:4000';
let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(`${name} ${detail}`);
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function api(method, path, { token, body, headers, rawBody } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    ...(rawBody ? { body: rawBody } : body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const crypto = require('crypto');
  const prisma = new PrismaClient();
  const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;
  const sign = (raw) => crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

  console.log('— 1. Health & setup —');
  const health = await api('GET', '/api/health');
  check('health UP', health.status === 200 && health.json?.success === true);

  const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
  const reg = await api('POST', '/api/auth/register', { body: { fullName: 'Phase6 Smoker', phone, password: 'Smoke6Pass123!' } });
  check('register 201', reg.status === 201);
  const login = await api('POST', '/api/auth/login', { body: { phone, password: 'Smoke6Pass123!' } });
  const token = login.json?.data?.token;
  check('login issues token', !!token);
  const userId = login.json?.data?.user?.id || reg.json?.data?.user?.id;

  const prods = await api('GET', '/api/products?limit=5');
  const product = prods.json?.data?.[0];
  const detail = await api('GET', `/api/products/slug/${product.slug}`);
  const stockBefore = detail.json.data.availability.stockQuantity;

  console.log('— 2. Order starts PENDING_PAYMENT, no payments —');
  const add = await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 2 } });
  check('add item 201', add.status === 201);
  const orderRes = await api('POST', '/api/orders', { token, body: { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 1 } });
  const order = orderRes.json?.data?.order;
  check('order created 201', orderRes.status === 201);
  check('order starts PENDING_PAYMENT', order?.status === 'PENDING_PAYMENT');

  console.log('— 3. Payment initiation (server-authoritative) —');
  const pay = await api('POST', `/api/orders/${order.id}/payment`, {
    token,
    body: { amount: 1, currency: 'USD', paymentStatus: 'SUCCESS', providerRef: 'FAKE' },
  });
  const payment = pay.json?.data?.payment;
  check('initiation 200', pay.status === 200);
  check('attempt PENDING (client SUCCESS ignored)', payment?.status === 'PENDING');
  check('authoritative amount (client "1" ignored)', payment?.amountUgx === order.pricing.commitmentUgx && payment?.amountUgx > 0);
  check('currency locked to UGX', payment?.currency === 'UGX');
  check('initiation retry reuses attempt', (await api('POST', `/api/orders/${order.id}/payment`, { token, body: {} })).json?.data?.payment?.id === payment.id);

  console.log('— 4. Webhook security —');
  const unsigned = await api('POST', '/api/payments/webhook', { rawBody: JSON.stringify({ providerRef: payment.providerRef, orderNumber: order.orderNumber, amountUgx: payment.amountUgx, currency: 'UGX', outcome: 'SUCCESS' }) });
  check('missing signature rejected 400', unsigned.status === 400);
  const badSig = await api('POST', '/api/payments/webhook', {
    rawBody: JSON.stringify({ providerRef: payment.providerRef, orderNumber: order.orderNumber, amountUgx: payment.amountUgx, currency: 'UGX', outcome: 'SUCCESS' }),
    headers: { 'x-ugafresh-signature': 'ff'.repeat(32) },
  });
  check('invalid signature rejected 400', badSig.status === 400);

  console.log('— 5. Failed payment → retry → success —');
  const failRaw = JSON.stringify({ providerRef: payment.providerRef, orderNumber: order.orderNumber, amountUgx: payment.amountUgx, currency: 'UGX', outcome: 'FAILED' });
  const fail = await api('POST', '/api/payments/webhook', { rawBody: failRaw, headers: { 'x-ugafresh-signature': sign(failRaw) } });
  check('FAILED webhook accepted', fail.status === 200 && fail.json?.event === 'PAYMENT_FAILED_RECORDED');
  const stockAfterFail = await api('GET', `/api/products/slug/${product.slug}`);
  check('failed payment leaves order unpaid', fail.json?.data?.orderStatus === 'PENDING_PAYMENT');
  const retryPay = await api('POST', `/api/orders/${order.id}/payment`, { token, body: {} });
  const retryPayment = retryPay.json?.data?.payment;
  check('retry initiation creates fresh attempt', retryPayment?.id !== payment.id && retryPayment?.status === 'PENDING');
  const okRaw = JSON.stringify({ providerRef: retryPayment.providerRef, orderNumber: order.orderNumber, amountUgx: retryPayment.amountUgx, currency: 'UGX', outcome: 'SUCCESS' });
  const ok = await api('POST', '/api/payments/webhook', { rawBody: okRaw, headers: { 'x-ugafresh-signature': sign(okRaw) } });
  check('SUCCESS webhook verified', ok.status === 200 && ok.json?.event === 'PAYMENT_APPLIED');
  check('order COMMITMENT_PAID', ok.json?.data?.orderStatus === 'COMMITMENT_PAID');
  check('payment SUCCESS', ok.json?.data?.paymentStatus === 'SUCCESS');
  check('stock untouched by payment flow', (await api('GET', `/api/products/slug/${product.slug}`)).json.data.availability.stockQuantity === stockAfterFail.json.data.availability.stockQuantity);

  console.log('— 6. Replay & duplicate protection —');
  const replay = await api('POST', '/api/payments/webhook', { rawBody: okRaw, headers: { 'x-ugafresh-signature': sign(okRaw) } });
  check('duplicate webhook harmless (ALREADY_PROCESSED)', replay.status === 200 && replay.json?.event === 'ALREADY_PROCESSED');
  const successes = await prisma.payment.count({ where: { orderId: order.id, status: 'SUCCESS' } });
  check('exactly one successful payment', successes === 1);
  const histCount = await prisma.orderStatusHistory.count({ where: { orderId: order.id, statusTo: 'COMMITMENT_PAID' } });
  check('exactly one COMMITMENT_PAID history entry', histCount === 1);
  const reInit = await api('POST', `/api/orders/${order.id}/payment`, { token, body: {} });
  check('re-initiation returns existing success, no new payment', reInit.json?.data?.reused === true && (await prisma.payment.count({ where: { orderId: order.id } })) === 2);

  console.log('— 7. Ownership & admin boundaries —');
  const phone2 = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
  await api('POST', '/api/auth/register', { body: { fullName: 'Phase6 Smoker B', phone: phone2, password: 'Smoke6Pass123!' } });
  const login2 = await api('POST', '/api/auth/login', { body: { phone: phone2, password: 'Smoke6Pass123!' } });
  const token2 = login2.json?.data?.token;
  const steal = await api('POST', `/api/orders/${order.id}/payment`, { token: token2, body: {} });
  check("customer B cannot pay customer A's order (404)", steal.status === 404);
  const peek = await api('GET', `/api/orders/${order.id}/payment`, { token: token2 });
  check("customer B cannot view customer A's payment (404)", peek.status === 404);
  const custAdmin = await api('GET', `/api/admin/orders/${order.id}/payment`, { token });
  check('customer token rejected on admin payment view (401)', custAdmin.status === 401);
  const adminLogin = await api('POST', '/api/admin/auth/login', { body: { email: process.env.ADMIN_1_EMAIL, password: process.env.ADMIN_1_PASSWORD } });
  const adminToken = adminLogin.json?.data?.token;
  const adminView = await api('GET', `/api/admin/orders/${order.id}/payment`, { token: adminToken });
  check('admin can view payments read-only (200)', adminView.status === 200 && Array.isArray(adminView.json?.data?.payments));
  check('no secret exposure in responses', !JSON.stringify({ ok: replay.json, view: adminView.json }).includes(WEBHOOK_SECRET));

  console.log('— 8. Cancellation after payment (no fake refund) —');
  const cancel = await api('POST', `/api/orders/${order.id}/cancel`, { token, body: { reason: 'smoke cancel' } });
  check('COMMITMENT_PAID order cancellable by owner (200)', cancel.status === 200 && cancel.json?.data?.order?.status === 'CANCELLED');
  const payAfter = await prisma.payment.findUnique({ where: { id: retryPayment.id } });
  check('payment record preserved (no fake refund)', payAfter.status === 'SUCCESS' && payAfter.verifiedAt !== null);
  const stockAfterCancel = await api('GET', `/api/products/slug/${product.slug}`);
  check('stock restored exactly once by cancellation', stockAfterCancel.json.data.availability.stockQuantity === stockBefore);

  console.log('— Cleanup (exact, inventory-derived) —');
  const orderIds = [order.id];
  for (const oid of orderIds) {
    await prisma.auditLog.deleteMany({ where: { entityId: oid } });
    await prisma.payment.deleteMany({ where: { orderId: oid } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
    await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
    // Phase 7: deliveries.order_id FK restricts order deletion
    await prisma.delivery.deleteMany({ where: { orderId: oid } });
    await prisma.orderItem.deleteMany({ where: { orderId: oid } });
    await prisma.order.deleteMany({ where: { id: oid } });
  }
  await prisma.auditLog.deleteMany({ where: { entityName: 'Payment', entityId: payment.id } });
  await prisma.auditLog.deleteMany({ where: { entityName: 'Payment', entityId: retryPayment.id } });
  const cartUserIds = [userId, (await prisma.user.findFirst({ where: { fullName: 'Phase6 Smoker B' } }))?.id].filter(Boolean);
  for (const uid of cartUserIds) {
    await prisma.cartItem.deleteMany({ where: { cart: { userId: uid } } });
    await prisma.cart.deleteMany({ where: { userId: uid } });
    await prisma.user.delete({ where: { id: uid } }).catch(() => {});
  }
  console.log(`  🧹 cleaned 1 order, 2 payments, 2 smoke customers`);

  await prisma.$disconnect();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    failures.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  }
})().catch((e) => {
  console.error('SMOKE RUNNER ERROR:', e);
  process.exit(1);
});
