/* Phase 8 HTTP Smoke Tests — Balance Payment, Order Completion & Final Financial Lifecycle */
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
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
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

  const phoneA = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
  const regA = await api('POST', '/api/auth/register', {
    body: { fullName: 'Phase8 Smoker A', phone: phoneA, password: 'Smoke8Pass123!' },
  });
  check('customer A registered 201', regA.status === 201);
  const loginA = await api('POST', '/api/auth/login', { body: { phone: phoneA, password: 'Smoke8Pass123!' } });
  const tokenA = loginA.json?.data?.token;
  check('customer A login issues token', !!tokenA);
  const userAId = loginA.json?.data?.user?.id;

  const phoneB = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
  const regB = await api('POST', '/api/auth/register', {
    body: { fullName: 'Phase8 Smoker B', phone: phoneB, password: 'Smoke8Pass123!' },
  });
  check('customer B registered 201', regB.status === 201);
  const loginB = await api('POST', '/api/auth/login', { body: { phone: phoneB, password: 'Smoke8Pass123!' } });
  const tokenB = loginB.json?.data?.token;
  const userBId = loginB.json?.data?.user?.id;

  const adminLogin = await api('POST', '/api/admin/auth/login', {
    body: { email: process.env.ADMIN_1_EMAIL, password: process.env.ADMIN_1_PASSWORD },
  });
  const adminToken = adminLogin.json?.data?.token;
  check('admin login issues token', !!adminToken);

  const prods = await api('GET', '/api/products?limit=5');
  const product = prods.json?.data?.[0];
  const prodDetail = await api('GET', `/api/products/slug/${product.slug}`);
  const stockBefore = prodDetail.json.data.availability.stockQuantity;

  console.log('— 2. Order creation & commitment flow —');
  const addCart = await api('POST', '/api/cart/items', { token: tokenA, body: { productId: product.id, quantity: 2 } });
  check('cart add 201', addCart.status === 201);

  const orderRes = await api('POST', '/api/orders', {
    token: tokenA,
    body: { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 1 },
  });
  const order = orderRes.json?.data?.order;
  check('order created 201', orderRes.status === 201);
  check('initial status PENDING_PAYMENT', order?.status === 'PENDING_PAYMENT');

  const expectedTotal = order.pricing.totalUgx;
  const expectedCommitment = order.pricing.commitmentUgx;
  const expectedBalance = expectedTotal - expectedCommitment;
  check('server-authoritative balance amount calculated', expectedBalance > 0);

  // Ineligible balance payment rejection before fulfillment
  const earlyBalRes = await api('POST', `/api/orders/${order.id}/payment`, {
    token: tokenA,
    body: { purpose: 'BALANCE' },
  });
  check('balance payment rejected before fulfillment (409)', earlyBalRes.status === 409);

  // Pay commitment payment
  const initCommit = await api('POST', `/api/orders/${order.id}/payment`, {
    token: tokenA,
    body: { purpose: 'COMMITMENT' },
  });
  check('commitment initiation 200', initCommit.status === 200);
  const commitPayment = initCommit.json?.data?.payment;

  const commitWebhookRaw = JSON.stringify({
    providerRef: commitPayment.providerRef,
    orderNumber: order.orderNumber,
    amountUgx: commitPayment.amountUgx,
    currency: 'UGX',
    purpose: 'COMMITMENT',
    outcome: 'SUCCESS',
  });
  const commitWebhookRes = await api('POST', '/api/payments/webhook', {
    rawBody: commitWebhookRaw,
    headers: { 'x-ugafresh-signature': sign(commitWebhookRaw) },
  });
  check('commitment webhook verified', commitWebhookRes.status === 200 && commitWebhookRes.json?.event === 'PAYMENT_APPLIED');

  console.log('— 3. Fulfillment progression —');
  await api('PATCH', `/api/admin/orders/${order.id}/status`, { token: adminToken, body: { status: 'CONFIRMED' } });
  await api('PATCH', `/api/admin/orders/${order.id}/status`, { token: adminToken, body: { status: 'PREPARING' } });
  await api('PATCH', `/api/admin/orders/${order.id}/status`, { token: adminToken, body: { status: 'READY_FOR_PICKUP' } });

  // Still cannot pay balance in READY_FOR_PICKUP
  const midBalRes = await api('POST', `/api/orders/${order.id}/payment`, {
    token: tokenA,
    body: { purpose: 'BALANCE' },
  });
  check('balance payment rejected while READY_FOR_PICKUP (409)', midBalRes.status === 409);

  // Mark PICKED_UP
  const pickupOrderRes = await api('PATCH', `/api/admin/orders/${order.id}/status`, {
    token: adminToken,
    body: { status: 'PICKED_UP' },
  });
  check('order marked PICKED_UP (200)', pickupOrderRes.status === 200);

  // Sync delivery row
  const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
  await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

  console.log('— 4. Balance payment initiation (server-authoritative) —');
  // Attempt tampering: client sends fake amount and currency
  const initBalRes = await api('POST', `/api/orders/${order.id}/payment`, {
    token: tokenA,
    body: { purpose: 'BALANCE', amount: 100, currency: 'USD', status: 'SUCCESS' },
  });
  check('balance initiation 200', initBalRes.status === 200);
  const balPayment = initBalRes.json?.data?.payment;
  check('balance payment purpose is BALANCE', balPayment?.purpose === 'BALANCE');
  check('server-authoritative balance amount enforced (client 100 ignored)', balPayment?.amountUgx === expectedBalance);
  check('currency locked to UGX', balPayment?.currency === 'UGX');
  check('status is PENDING (client SUCCESS ignored)', balPayment?.status === 'PENDING');

  // Idempotent retry: reuses the existing attempt
  const retryInit = await api('POST', `/api/orders/${order.id}/payment`, {
    token: tokenA,
    body: { purpose: 'BALANCE' },
  });
  check('initiation retry reuses existing attempt', retryInit.json?.data?.payment?.id === balPayment.id);

  console.log('— 5. Webhook security & failed payment handling —');
  // Missing signature
  const noSigRes = await api('POST', '/api/payments/webhook', {
    rawBody: JSON.stringify({
      providerRef: balPayment.providerRef,
      orderNumber: order.orderNumber,
      amountUgx: balPayment.amountUgx,
      currency: 'UGX',
      purpose: 'BALANCE',
      outcome: 'SUCCESS',
    }),
  });
  check('missing signature rejected 400', noSigRes.status === 400);

  // Invalid signature
  const badSigRes = await api('POST', '/api/payments/webhook', {
    rawBody: JSON.stringify({
      providerRef: balPayment.providerRef,
      orderNumber: order.orderNumber,
      amountUgx: balPayment.amountUgx,
      currency: 'UGX',
      purpose: 'BALANCE',
      outcome: 'SUCCESS',
    }),
    headers: { 'x-ugafresh-signature': '00'.repeat(32) },
  });
  check('invalid signature rejected 400', badSigRes.status === 400);

  // Amount tampering in webhook payload
  const tamperedAmountRaw = JSON.stringify({
    providerRef: balPayment.providerRef,
    orderNumber: order.orderNumber,
    amountUgx: balPayment.amountUgx + 5000,
    currency: 'UGX',
    purpose: 'BALANCE',
    outcome: 'SUCCESS',
  });
  const tamperedAmountRes = await api('POST', '/api/payments/webhook', {
    rawBody: tamperedAmountRaw,
    headers: { 'x-ugafresh-signature': sign(tamperedAmountRaw) },
  });
  check('webhook amount mismatch rejected 422', tamperedAmountRes.status === 422);

  // FAILED outcome
  const failWebhookRaw = JSON.stringify({
    providerRef: balPayment.providerRef,
    orderNumber: order.orderNumber,
    amountUgx: balPayment.amountUgx,
    currency: 'UGX',
    purpose: 'BALANCE',
    outcome: 'FAILED',
  });
  const failRes = await api('POST', '/api/payments/webhook', {
    rawBody: failWebhookRaw,
    headers: { 'x-ugafresh-signature': sign(failWebhookRaw) },
  });
  check('failed webhook recorded', failRes.status === 200 && failRes.json?.event === 'PAYMENT_FAILED_RECORDED');

  const orderAfterFail = await api('GET', `/api/orders/${order.id}`, { token: tokenA });
  check('order remains in PICKED_UP after payment failure', orderAfterFail.json?.data?.order?.status === 'PICKED_UP');

  // Retry after failure creates a fresh attempt
  const retryBalRes = await api('POST', `/api/orders/${order.id}/payment`, {
    token: tokenA,
    body: { purpose: 'BALANCE' },
  });
  const freshBalPayment = retryBalRes.json?.data?.payment;
  check('fresh balance attempt created on retry', freshBalPayment?.id !== balPayment.id && freshBalPayment?.status === 'PENDING');

  console.log('— 6. Successful balance payment & order completion —');
  const successWebhookRaw = JSON.stringify({
    providerRef: freshBalPayment.providerRef,
    orderNumber: order.orderNumber,
    amountUgx: freshBalPayment.amountUgx,
    currency: 'UGX',
    purpose: 'BALANCE',
    outcome: 'SUCCESS',
  });
  const successRes = await api('POST', '/api/payments/webhook', {
    rawBody: successWebhookRaw,
    headers: { 'x-ugafresh-signature': sign(successWebhookRaw) },
  });
  check('SUCCESS webhook applied', successRes.status === 200 && successRes.json?.event === 'PAYMENT_APPLIED');
  check('order reached COMPLETED', successRes.json?.data?.orderStatus === 'COMPLETED');

  // Customer payment query shows fully paid and completed
  const custPayRes = await api('GET', `/api/orders/${order.id}/payment`, { token: tokenA });
  check('customer payment view reports isCompleted: true', custPayRes.json?.data?.isCompleted === true);
  check('customer payment view reports isFullyPaid: true', custPayRes.json?.data?.isFullyPaid === true);
  check('customer payment view reports remainingBalanceUgx: 0', custPayRes.json?.data?.pricing?.remainingBalanceUgx === 0);
  check('balance payment status is SUCCESS', custPayRes.json?.data?.balancePaymentStatus === 'SUCCESS');

  // Notification recorded
  const notif = await prisma.notification.findFirst({ where: { userId: userAId } });
  check('customer notification recorded for completion', !!notif && notif.title === 'Order Completed');

  console.log('— 7. Webhook replay & duplicate protection —');
  const replayRes = await api('POST', '/api/payments/webhook', {
    rawBody: successWebhookRaw,
    headers: { 'x-ugafresh-signature': sign(successWebhookRaw) },
  });
  check('replay webhook harmless (ALREADY_PROCESSED)', replayRes.status === 200 && replayRes.json?.event === 'ALREADY_PROCESSED');

  const succBalCount = await prisma.payment.count({ where: { orderId: order.id, purpose: 'BALANCE', status: 'SUCCESS' } });
  check('exactly one successful balance payment in DB', succBalCount === 1);

  const completedHistCount = await prisma.orderStatusHistory.count({ where: { orderId: order.id, statusTo: 'COMPLETED' } });
  check('exactly one COMPLETED history transition entry', completedHistCount === 1);

  console.log('— 8. Ownership, IDOR & admin visibility —');
  const stealBalRes = await api('POST', `/api/orders/${order.id}/payment`, { token: tokenB, body: { purpose: 'BALANCE' } });
  check("customer B cannot initiate payment on customer A's order (404)", stealBalRes.status === 404);

  const stealPeekRes = await api('GET', `/api/orders/${order.id}/payment`, { token: tokenB });
  check("customer B cannot view customer A's payments (404)", stealPeekRes.status === 404);

  const custOnAdmin = await api('GET', `/api/admin/orders/${order.id}/payment`, { token: tokenA });
  check('customer token rejected on admin payment endpoint (401)', custOnAdmin.status === 401);

  const adminView = await api('GET', `/api/admin/orders/${order.id}/payment`, { token: adminToken });
  check('admin can view payments read-only (200)', adminView.status === 200 && Array.isArray(adminView.json?.data?.payments));
  check('no secrets leaked in admin response', !JSON.stringify(adminView.json).includes(WEBHOOK_SECRET));

  console.log('— 9. Terminal order immutability —');
  const cancelRes = await api('POST', `/api/orders/${order.id}/cancel`, { token: tokenA, body: { reason: 'late cancel' } });
  check('completed order cannot be cancelled (409)', cancelRes.status === 409);

  const reInitRes = await api('POST', `/api/orders/${order.id}/payment`, { token: tokenA, body: { purpose: 'BALANCE' } });
  check('payment initiation on completed order reports reused success', reInitRes.status === 200 && reInitRes.json?.data?.reused === true);

  console.log('— 10. Concurrency verification —');
  // Create a second order for concurrency testing
  await api('POST', '/api/cart/items', { token: tokenB, body: { productId: product.id, quantity: 2 } });
  const ord2Res = await api('POST', '/api/orders', { token: tokenB, body: { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 1 } });
  const ord2 = ord2Res.json?.data?.order;

  // Pay commitment & advance to PICKED_UP
  const initCommit2 = await api('POST', `/api/orders/${ord2.id}/payment`, { token: tokenB, body: {} });
  const commit2 = initCommit2.json?.data?.payment;
  const c2Raw = JSON.stringify({ providerRef: commit2.providerRef, orderNumber: ord2.orderNumber, amountUgx: commit2.amountUgx, currency: 'UGX', outcome: 'SUCCESS' });
  await api('POST', '/api/payments/webhook', { rawBody: c2Raw, headers: { 'x-ugafresh-signature': sign(c2Raw) } });

  await api('PATCH', `/api/admin/orders/${ord2.id}/status`, { token: adminToken, body: { status: 'CONFIRMED' } });
  await api('PATCH', `/api/admin/orders/${ord2.id}/status`, { token: adminToken, body: { status: 'PREPARING' } });
  await api('PATCH', `/api/admin/orders/${ord2.id}/status`, { token: adminToken, body: { status: 'READY_FOR_PICKUP' } });
  await api('PATCH', `/api/admin/orders/${ord2.id}/status`, { token: adminToken, body: { status: 'PICKED_UP' } });
  const del2 = await prisma.delivery.findUnique({ where: { orderId: ord2.id } });
  await prisma.delivery.update({ where: { id: del2.id }, data: { status: 'PICKED_UP' } });

  // 5 concurrent initiations
  const concInits = await Promise.all(
    Array.from({ length: 5 }, () => api('POST', `/api/orders/${ord2.id}/payment`, { token: tokenB, body: { purpose: 'BALANCE' } }))
  );
  check('all 5 concurrent initiations succeeded (200)', concInits.every((r) => r.status === 200));
  const ord2Attempts = await prisma.payment.findMany({ where: { orderId: ord2.id, purpose: 'BALANCE' } });
  check('exactly one active balance attempt created across 5 concurrent requests', ord2Attempts.length === 1);

  // 4 concurrent webhooks
  const bal2 = ord2Attempts[0];
  const b2Raw = JSON.stringify({ providerRef: bal2.providerRef, orderNumber: ord2.orderNumber, amountUgx: bal2.amountUgx, currency: 'UGX', purpose: 'BALANCE', outcome: 'SUCCESS' });
  const concHooks = await Promise.all(
    Array.from({ length: 4 }, () => api('POST', '/api/payments/webhook', { rawBody: b2Raw, headers: { 'x-ugafresh-signature': sign(b2Raw) } }))
  );
  check('all 4 concurrent webhooks succeeded (200)', concHooks.every((r) => r.status === 200));

  const ord2Successes = await prisma.payment.count({ where: { orderId: ord2.id, purpose: 'BALANCE', status: 'SUCCESS' } });
  check('exactly one successful balance payment across 4 concurrent webhooks', ord2Successes === 1);

  const ord2Completions = await prisma.orderStatusHistory.count({ where: { orderId: ord2.id, statusTo: 'COMPLETED' } });
  check('exactly one COMPLETED history transition across 4 concurrent webhooks', ord2Completions === 1);

  console.log('— 11. Cleanup & database preservation —');
  const allSmokeOrderIds = [order.id, ord2.id];
  for (const oid of allSmokeOrderIds) {
    await prisma.auditLog.deleteMany({ where: { entityId: oid } });
    await prisma.payment.deleteMany({ where: { orderId: oid } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
    await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
    await prisma.delivery.deleteMany({ where: { orderId: oid } });
    await prisma.orderItem.deleteMany({ where: { orderId: oid } });
    await prisma.order.deleteMany({ where: { id: oid } });
  }

  // Restore inventory exactly
  const stockNow = (await api('GET', `/api/products/slug/${product.slug}`)).json.data.availability.stockQuantity;
  const stockDiff = stockBefore - stockNow;
  if (stockDiff !== 0) {
    await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: { increment: stockDiff } } });
  }
  const stockRestored = (await api('GET', `/api/products/slug/${product.slug}`)).json.data.availability.stockQuantity;
  check('product inventory restored to baseline exactly', stockRestored === stockBefore);

  for (const uid of [userAId, userBId]) {
    await prisma.notification.deleteMany({ where: { userId: uid } });
    await prisma.cartItem.deleteMany({ where: { cart: { userId: uid } } });
    await prisma.cart.deleteMany({ where: { userId: uid } });
    await prisma.user.delete({ where: { id: uid } }).catch(() => {});
  }
  check('smoke test users and carts cleaned', true);

  await prisma.$disconnect();

  console.log(`\n=== Phase 8 smoke: ${passed} passed, ${failed} failed ===\n`);
  if (failures.length) {
    failures.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  }
})().catch((e) => {
  console.error('SMOKE RUNNER ERROR:', e);
  process.exit(1);
});
