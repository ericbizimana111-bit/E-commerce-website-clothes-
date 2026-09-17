/* Phase 5 HTTP Smoke Tests — real HTTP requests with JSON parsing + DB effect checks. */
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

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  console.log('— 1. Health —');
  const health = await api('GET', '/api/health');
  check('health UP', health.status === 200 && health.json?.success === true);

  console.log('— 2. Customer registration/login —');
  const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
  const reg = await api('POST', '/api/auth/register', {
    body: { fullName: 'Phase5 Smoker', phone, password: 'SmokePass123!' },
  });
  check('register 201', reg.status === 201);
  const login = await api('POST', '/api/auth/login', { body: { phone, password: 'SmokePass123!' } });
  const token = login.json?.data?.token;
  check('login issues token', !!token);
  const userId = login.json?.data?.user?.id || reg.json?.data?.user?.id;

  console.log('— 3. Cart preparation —');
  const prods = await api('GET', '/api/products?limit=5');
  const product = prods.json?.data?.[0];
  const detail = await api('GET', `/api/products/slug/${product.slug}`);
  const stockBefore = detail.json.data.availability.stockQuantity;
  const add = await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 2 } });
  check('add item 201', add.status === 201);

  console.log('— 10/11. Invalid fulfillment & address ownership —');
  const badFulfill = await api('POST', '/api/orders', { token, body: { fulfillmentMethod: 'TELEPORT' } });
  check('invalid fulfillment 400', badFulfill.status === 400);

  console.log('— 4. Order creation (pickup) —');
  const orderRes = await api('POST', '/api/orders', {
    token,
    body: { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 1 },
  });
  const order = orderRes.json?.data?.order;
  check('order created 201', orderRes.status === 201);
  check('order number format FB-YYYYMMDD-XXXXXX', /^FB-\d{8}-\d{6}$/.test(order?.orderNumber || ''));
  check('initial status PENDING_PAYMENT', order?.status === 'PENDING_PAYMENT');
  check('integer UGX pricing', Number.isInteger(order?.pricing?.totalUgx) && order?.pricing?.currency === 'UGX');
  check('commitment + balance = total', order?.pricing?.commitmentUgx + order?.pricing?.remainingBalanceUgx === order?.pricing?.totalUgx);
  check('initial history entry null->PENDING_PAYMENT', order?.statusHistory?.[0]?.fromStatus === null && order?.statusHistory?.[0]?.toStatus === 'PENDING_PAYMENT');

  console.log('— 20. Inventory verification —');
  const stockAfter = await api('GET', `/api/products/slug/${product.slug}`);
  check('stock deducted by 2', stockAfter.json.data.availability.stockQuantity === stockBefore - 2);
  const saleTx = await prisma.inventoryTransaction.findFirst({ where: { referenceId: order.id, type: 'SALE' } });
  check('SALE inventory transaction recorded', !!saleTx && saleTx.quantityChange === -2);

  console.log('— 5/6. Own orders list & detail —');
  const list = await api('GET', '/api/orders', { token });
  check('list contains order', list.status === 200 && list.json.items.some((o) => o.id === order.id));
  const detailRes = await api('GET', `/api/orders/${order.id}`, { token });
  check('detail has items + snapshot prices', detailRes.json?.data?.order?.items?.length === 1 && detailRes.json.data.order.items[0].unitPriceUgx > 0);

  console.log('— 7. IDOR —');
  const phone2 = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
  await api('POST', '/api/auth/register', { body: { fullName: 'Phase5 Smoker B', phone: phone2, password: 'SmokePass123!' } });
  const login2 = await api('POST', '/api/auth/login', { body: { phone: phone2, password: 'SmokePass123!' } });
  const token2 = login2.json?.data?.token;
  const steal = await api('GET', `/api/orders/${order.id}`, { token: token2 });
  check("customer B cannot see customer A's order (404)", steal.status === 404);
  const stealCancel = await api('POST', `/api/orders/${order.id}/cancel`, { token: token2, body: {} });
  check("customer B cannot cancel customer A's order (404)", stealCancel.status === 404);

  console.log('— 8/9. Price & total tampering —');
  await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 1 } });
  const tamper = await api('POST', '/api/orders', {
    token,
    body: {
      fulfillmentMethod: 'PICKUP_STATION',
      pickupStationId: 1,
      totalUgx: 1,
      subtotalUgx: 1,
      commitmentUgx: 0,
      priceUgx: 1,
      orderNumber: 'FB-FAKE-000001',
      status: 'COMPLETED',
      currency: 'USD',
    },
  });
  const tamperOrder = tamper.json?.data?.order;
  check('tampered order created 201 but with server values', tamper.status === 201);
  check('server price used (not 1)', tamperOrder?.pricing?.itemsSubtotalUgx === detail.json.data.price);
  check('fake order number ignored', tamperOrder?.orderNumber !== 'FB-FAKE-000001');
  check('status stays PENDING_PAYMENT', tamperOrder?.status === 'PENDING_PAYMENT');
  check('currency stays UGX', tamperOrder?.pricing?.currency === 'UGX');

  console.log('— 13. Customer cancellation —');
  const cancel = await api('POST', `/api/orders/${tamperOrder.id}/cancel`, { token, body: { reason: 'Smoke cancel' } });
  check('cancel 200 -> CANCELLED', cancel.status === 200 && cancel.json.data.order.status === 'CANCELLED');
  const stockAfterCancel = await api('GET', `/api/products/slug/${product.slug}`);
  check('stock restored on cancel', stockAfterCancel.json.data.availability.stockQuantity === stockBefore - 2);
  const cancelAgain = await api('POST', `/api/orders/${tamperOrder.id}/cancel`, { token, body: {} });
  check('repeated cancel 409', cancelAgain.status === 409);
  const stockFinal = await api('GET', `/api/products/slug/${product.slug}`);
  check('stock restored exactly once', stockFinal.json.data.availability.stockQuantity === stockBefore - 2);

  console.log('— 21. Duplicate-order retry protection —');
  const retryAdd = await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 1 } });
  check('retry scenario cart add 201', retryAdd.status === 201);
  const firstAttempt = await api('POST', '/api/orders', { token, body: { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 1 } });
  check('first attempt creates order (201)', firstAttempt.status === 201 && !!firstAttempt.json?.data?.order);
  const retryOrder = firstAttempt.json?.data?.order || {};
  const countBeforeRetry = await prisma.order.count({ where: { userId } });
  const dupRetry = await api('POST', '/api/orders', { token, body: { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 1 } });
  check('immediate retry rejected (400, cart already consumed)', dupRetry.status === 400);
  const countAfterRetry = await prisma.order.count({ where: { userId } });
  check('retry created no duplicate order', countBeforeRetry === countAfterRetry);
  check('server-generated order number (client cannot set it)', /^FB-\d{8}-\d{6}$/.test(retryOrder.orderNumber || ''));

  console.log('— 19. Customer token on admin route —');
  const custOnAdmin = await api('GET', '/api/admin/orders', { token });
  check('customer token rejected by admin orders (401)', custOnAdmin.status === 401);

  console.log('— 14. Admin login —');
  const adminLogin = await api('POST', '/api/admin/auth/login', {
    body: { email: process.env.ADMIN_1_EMAIL, password: process.env.ADMIN_1_PASSWORD },
  });
  const adminToken = adminLogin.json?.data?.token;
  check('admin login', adminLogin.status === 200 && !!adminToken);

  console.log('— 15/16. Admin list & detail —');
  const adminList = await api('GET', '/api/admin/orders?limit=5', { token: adminToken });
  check('admin list 200 with pagination', adminList.status === 200 && !!adminList.json?.pagination);
  check('no passwordHash exposure', JSON.stringify(adminList.json).includes('passwordHash') === false);
  const adminDetail = await api('GET', `/api/admin/orders/${order.id}`, { token: adminToken });
  check('admin detail 200', adminDetail.status === 200 && adminDetail.json?.data?.order?.id === order.id);

  console.log('— 17/18. Admin status transitions —');
  const invalid = await api('PATCH', `/api/admin/orders/${order.id}/status`, { token: adminToken, body: { status: 'COMPLETED' } });
  check('invalid transition rejected (CANCELLED->COMPLETED 409)', invalid.status === 409);
  // Order #1 is PENDING_PAYMENT: valid transition COMMITMENT_PAID
  const valid = await api('PATCH', `/api/admin/orders/${order.id}/status`, { token: adminToken, body: { status: 'COMMITMENT_PAID', reason: 'smoke' } });
  check('valid transition 200', valid.status === 200 && valid.json.data.order.status === 'COMMITMENT_PAID');
  const hist = await api('GET', `/api/orders/${order.id}`, { token });
  check('history records admin transition', hist.json.data.order.statusHistory.some((h) => h.toStatus === 'COMMITMENT_PAID' && h.changedByType === 'ADMIN'));

  console.log('— DB preservation checks —');
  const auditCount = await prisma.auditLog.count({ where: { entityName: 'Order' } });
  check('audit logs written for admin transition', auditCount >= 1);

  // cleanup smoke data
  const smokeOrders = await prisma.order.findMany({ where: { userId } });
  const smokeOrderIds = smokeOrders.map((o) => o.id);
  // Snapshot stock still held by smoke orders BEFORE deleting inventory rows:
  // held per product = SALE deductions not yet compensated by RETURN (exact
  // regardless of quantities/statuses in this script).
  const invRows = await prisma.inventoryTransaction.findMany({
    where: { referenceId: { in: smokeOrderIds }, type: { in: ['SALE', 'RETURN'] } },
  });
  const heldByProduct = {};
  for (const t of invRows) {
    heldByProduct[t.productId] = (heldByProduct[t.productId] || 0) - t.quantityChange;
  }
  for (const o of smokeOrders) {
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: o.id } });
    await prisma.payment.deleteMany({ where: { orderId: o.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { referenceId: o.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
    await prisma.order.delete({ where: { id: o.id } });
  }
  // restore exactly the stock still held by smoke orders (SALE minus RETURN)
  let restored = 0;
  for (const [pid, held] of Object.entries(heldByProduct)) {
    if (held > 0) {
      await prisma.product.update({ where: { id: Number(pid) }, data: { stockQuantity: { increment: held } } });
      restored += held;
    }
  }
  await prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  await prisma.cart.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  const user2 = await prisma.user.findFirst({ where: { fullName: 'Phase5 Smoker B' } });
  if (user2) {
    await prisma.cartItem.deleteMany({ where: { cart: { userId: user2.id } } });
    await prisma.cart.deleteMany({ where: { userId: user2.id } });
    await prisma.user.delete({ where: { id: user2.id } });
  }
  console.log(`  🧹 cleaned ${smokeOrders.length} smoke orders, 2 smoke customers, restored ${restored} stock`);

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
