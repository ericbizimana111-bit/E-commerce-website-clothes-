/* Phase 7 HTTP Smoke Tests — delivery & fulfillment boundary over real HTTP. */
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

  console.log('— 1. Setup: customer, admin, product, address —');
  const health = await api('GET', '/api/health');
  check('health UP', health.status === 200 && health.json?.success === true);

  const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
  const reg = await api('POST', '/api/auth/register', { body: { fullName: 'Phase7 Smoker', phone, password: 'Smoke7Pass123!' } });
  check('register 201', reg.status === 201);
  const login = await api('POST', '/api/auth/login', { body: { phone, password: 'Smoke7Pass123!' } });
  const token = login.json?.data?.token;
  check('login issues token', !!token);
  const userId = login.json?.data?.user?.id || reg.json?.data?.user?.id;

  const adminLogin = await api('POST', '/api/admin/auth/login', {
    body: { email: process.env.ADMIN_1_EMAIL, password: process.env.ADMIN_1_PASSWORD },
  });
  const adminToken = adminLogin.json?.data?.token;
  check('admin login', !!adminToken);
  const adminId = adminLogin.json?.data?.admin?.id;

  const prods = await api('GET', '/api/products?limit=5');
  const product = prods.json?.data?.[0];
  check('a product exists for ordering', !!product?.id);

  const addressRes = await api('POST', '/api/addresses', {
    token,
    body: { title: 'Smoke Home', district: 'Kampala', streetAddress: '1 Smoke Street' },
  }).catch(() => null);
  let addressId = addressRes?.json?.data?.address?.id || addressRes?.json?.data?.id;
  if (!addressId) {
    const created = await prisma.address.create({
      data: { userId, title: 'Smoke Home', district: 'Kampala', streetAddress: '1 Smoke Street' },
    });
    addressId = created.id;
  }
  check('address available', !!addressId);

  const createdOrderIds = [];
  async function makeOrder(fulfillmentMethod, body = {}) {
    await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 1 } });
    const res = await api('POST', '/api/orders', {
      token,
      body: { fulfillmentMethod, ...(fulfillmentMethod === 'HOME_DELIVERY' ? { addressId } : { pickupStationId: 1 }), ...body },
    });
    if (res.json?.data?.order?.id) createdOrderIds.push(res.json.data.order.id);
    return res;
  }
  async function payCommitment(order) {
    const init = await api('POST', `/api/orders/${order.id}/payment`, { token, body: {} });
    const payment = init.json?.data?.payment;
    const raw = JSON.stringify({ providerRef: payment.providerRef, orderNumber: order.orderNumber, amountUgx: payment.amountUgx, currency: 'UGX', outcome: 'SUCCESS' });
    return api('POST', '/api/payments/webhook', { rawBody: raw, headers: { 'x-ugafresh-signature': sign(raw) } });
  }
  async function advance(order, statuses) {
    for (const status of statuses) {
      const r = await api('PATCH', `/api/admin/orders/${order.id}/status`, { token: adminToken, body: { status } });
      if (r.status !== 200) return r;
    }
    return null;
  }

  console.log('— 2. Home delivery creation (fee + snapshot, one per order) —');
  const hd = await makeOrder('HOME_DELIVERY', { deliveryFee: 1, distanceKm: 0 });
  const hdOrder = hd.json?.data?.order;
  check('home order created 201', hd.status === 201);
  check('order has server-computed delivery fee', typeof hdOrder?.pricing?.deliveryFeeUgx === 'number' && Number.isInteger(hdOrder.pricing.deliveryFeeUgx));
  const hdDv = await api('GET', `/api/orders/${hdOrder.id}/delivery`, { token });
  const hdDelivery = hdDv.json?.data?.delivery;
  check('customer delivery view 200', hdDv.status === 200);
  check('delivery PENDING, HOME_DELIVERY', hdDelivery?.status === 'PENDING' && hdDelivery?.fulfillmentType === 'HOME_DELIVERY');
  check('delivery fee = order fee (client "1" ignored)', hdDelivery?.deliveryFeeUgx === hdOrder.pricing.deliveryFeeUgx && hdDelivery.deliveryFeeUgx !== 1);
  check('address snapshot present', !!hdDelivery?.addressSnapshot?.streetAddress);
  check('no internal dispatcher fields leaked', hdDelivery && !('assignedAdmin' in hdDelivery) && !('notes' in hdDelivery));

  const again = await prisma.delivery.count({ where: { orderId: hdOrder.id } });
  check('exactly one delivery per order (DB unique)', again === 1);

  console.log('— 3. Pickup fulfillment —');
  const pk = await makeOrder('PICKUP_STATION');
  const pkOrder = pk.json?.data?.order;
  check('pickup order created 201', pk.status === 201);
  const pkDv = await api('GET', `/api/orders/${pkOrder.id}/delivery`, { token });
  check('pickup delivery: zero fee + station snapshot', pkDv.json?.data?.delivery?.deliveryFeeUgx === 0 && !!pkDv.json?.data?.delivery?.stationSnapshot);

  console.log('— 4. IDOR & RBAC —');
  const phoneB = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
  await api('POST', '/api/auth/register', { body: { fullName: 'Phase7 Smoker B', phone: phoneB, password: 'Smoke7Pass123!' } });
  const loginB = await api('POST', '/api/auth/login', { body: { phone: phoneB, password: 'Smoke7Pass123!' } });
  const tokenB = loginB.json?.data?.token;
  const idor = await api('GET', `/api/orders/${hdOrder.id}/delivery`, { token: tokenB });
  check('customer B cannot view A delivery (404)', idor.status === 404);
  const custAssign = await api('PATCH', `/api/admin/deliveries/${hdDelivery.id}/assign`, { token, body: { assignedAdminId: adminId } });
  check('customer cannot assign (401/403)', [401, 403].includes(custAssign.status));
  const custStatus = await api('PATCH', `/api/admin/deliveries/${hdDelivery.id}/status`, { token, body: { status: 'DELIVERED' } });
  check('customer cannot set delivery status (401/403)', [401, 403].includes(custStatus.status));
  const noAuth = await api('GET', '/api/admin/deliveries');
  check('admin deliveries list requires auth (401)', noAuth.status === 401);

  console.log('— 5. Admin list/detail/assignment —');
  const list = await api('GET', '/api/admin/deliveries?limit=5', { token: adminToken });
  check('admin list 200 + paginated', list.status === 200 && !!list.json?.data?.pagination);
  const listFiltered = await api('GET', '/api/admin/deliveries?status=PENDING&fulfillmentType=HOME_DELIVERY&limit=5', { token: adminToken });
  check('admin list filters work', listFiltered.status === 200 && listFiltered.json?.data?.items?.every((d) => d.status === 'PENDING' && d.fulfillmentType === 'HOME_DELIVERY'));
  const detail = await api('GET', `/api/admin/deliveries/${hdDelivery.id}`, { token: adminToken });
  check('admin detail 200 with assignee field', detail.status === 200 && 'assignedAdmin' in detail.json.data.delivery);
  const assign = await api('PATCH', `/api/admin/deliveries/${hdDelivery.id}/assign`, { token: adminToken, body: { assignedAdminId: adminId } });
  check('assignment 200 → ASSIGNED', assign.status === 200 && assign.json?.data?.delivery?.status === 'ASSIGNED');
  check('assignedAdmin populated', assign.json?.data?.delivery?.assignedAdmin?.id === adminId);

  console.log('— 6. Full home-delivery flow with order sync —');
  const paid = await payCommitment(hdOrder);
  check('commitment paid via webhook', paid.status === 200 && paid.json?.event === 'PAYMENT_APPLIED');
  const advErr = await advance(hdOrder, ['CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY']);
  check('lifecycle to READY_FOR_DELIVERY', advErr === null);
  const readyDv = await api('GET', `/api/orders/${hdOrder.id}/delivery`, { token });
  check('delivery synced READY', readyDv.json?.data?.delivery?.status === 'READY');
  const dispatch = await api('PATCH', `/api/admin/deliveries/${hdDelivery.id}/status`, { token: adminToken, body: { status: 'OUT_FOR_DELIVERY' } });
  check('dispatch 200', dispatch.status === 200);
  const outDv = await api('GET', `/api/orders/${hdOrder.id}`, { token });
  check('order synced OUT_FOR_DELIVERY', outDv.json?.data?.order?.status === 'OUT_FOR_DELIVERY');
  const complete = await api('PATCH', `/api/admin/deliveries/${hdDelivery.id}/status`, { token: adminToken, body: { status: 'DELIVERED' } });
  check('delivery DELIVERED', complete.status === 200);
  const delDv = await api('GET', `/api/orders/${hdOrder.id}`, { token });
  check('order synced DELIVERED + history', delDv.json?.data?.order?.status === 'DELIVERED' && delDv.json.data.order.statusHistory.filter((h) => h.toStatus === 'DELIVERED').length === 1);

  console.log('— 7. Invalid transitions & terminal protection —');
  const badTransition = await api('PATCH', `/api/admin/deliveries/${hdDelivery.id}/status`, { token: adminToken, body: { status: 'PENDING' } });
  check('DELIVERED → PENDING rejected 409', badTransition.status === 409);
  const reassign = await api('PATCH', `/api/admin/deliveries/${hdDelivery.id}/assign`, { token: adminToken, body: { assignedAdminId: adminId } });
  check('terminal delivery cannot be reassigned 409', reassign.status === 409);
  const repeat = await api('PATCH', `/api/admin/deliveries/${hdDelivery.id}/status`, { token: adminToken, body: { status: 'DELIVERED' } });
  check('repeat DELIVERED idempotent (repeated=true, 200)', repeat.status === 200 && repeat.json?.data?.delivery?.repeated === true);

  console.log('— 8. Pickup flow + cancellation interaction —');
  const pkPaid = await payCommitment(pkOrder);
  check('pickup commitment paid', pkPaid.status === 200);
  await advance(pkOrder, ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']);
  const pick = await api('PATCH', `/api/admin/deliveries/${pkDv.json.data.delivery.id}/status`, { token: adminToken, body: { status: 'PICKED_UP' } });
  check('PICKED_UP 200', pick.status === 200);
  const pkOrderCheck = await api('GET', `/api/orders/${pkOrder.id}`, { token });
  check('order PICKED_UP', pkOrderCheck.json?.data?.order?.status === 'PICKED_UP');

  const cx = await makeOrder('HOME_DELIVERY');
  const cxOrder = cx.json?.data?.order;
  const cxDv = await api('GET', `/api/orders/${cxOrder.id}/delivery`, { token });
  const cancel = await api('POST', `/api/orders/${cxOrder.id}/cancel`, { token, body: {} });
  check('cancel 200', cancel.status === 200);
  const cxDv2 = await api('GET', `/api/orders/${cxOrder.id}/delivery`, { token });
  check('delivery CANCELLED after order cancel', cxDv2.json?.data?.delivery?.status === 'CANCELLED');

  console.log('— 9. Cleanup —');
  for (const oid of createdOrderIds) {
    // Exact stock restoration: units still held = -(sum of inventory deltas)
    // (SALE rows are negative; customer-cancelled orders already carry a
    // RETURN row, so their net is 0).
    const invRows = await prisma.inventoryTransaction.findMany({ where: { referenceId: oid } });
    const heldByProduct = {};
    for (const r of invRows) heldByProduct[r.productId] = (heldByProduct[r.productId] || 0) - r.quantityChange;
    for (const [pid, held] of Object.entries(heldByProduct)) {
      if (held > 0) {
        await prisma.product.update({ where: { id: Number(pid) }, data: { stockQuantity: { increment: held } } });
      }
    }
    const delivery = await prisma.delivery.findUnique({ where: { orderId: oid }, select: { id: true } });
    const entityIds = delivery ? [oid, delivery.id] : [oid];
    await prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.notification.deleteMany({ where: { linkUrl: { contains: oid } } });
    await prisma.delivery.deleteMany({ where: { orderId: oid } });
    await prisma.payment.deleteMany({ where: { orderId: oid } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
    await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
    await prisma.orderItem.deleteMany({ where: { orderId: oid } });
    await prisma.order.deleteMany({ where: { id: oid } });
  }
  await prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  await prisma.address.deleteMany({ where: { userId } });
  await prisma.cart.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.user.deleteMany({ where: { fullName: 'Phase7 Smoker B' } });
  await prisma.auditLog.deleteMany({ where: { adminId, entityName: 'Delivery' } });
  await prisma.$disconnect();

  console.log(`\n=== Phase 7 smoke: ${passed} passed, ${failed} failed ===`);
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('SMOKE SCRIPT ERROR:', e);
  process.exit(1);
});
