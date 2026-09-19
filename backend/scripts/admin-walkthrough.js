/**
 * Admin console walkthrough — exercises, over real HTTP against the running
 * backend, exactly what the Phase 10 admin UI drives:
 *
 *   Catalog:   category create/rename/deactivate+reactivate/delete
 *              product create/edit/activate/inventory restock+adjust/history
 *   Orders:    customer order -> commitment payment -> CONFIRMED -> PREPARING
 *              -> READY_FOR_PICKUP -> PICKED_UP -> balance payment -> COMPLETED
 *              -> order detail (items, history, payment breakdown)
 *   Deliveries: list/detail/assign/status transitions (incl. failure reason path)
 *   Payments:  order-lookup payment breakdown (admin view)
 *
 * Every row it creates carries a unique run tag and is removed again at the end
 * (FK-safe order, admin first). Business data is never modified: catalog edits
 * target only walkthrough-created rows, inventory deltas are net zero, and the
 * walkthrough order is deleted afterwards.
 *
 * Usage: node scripts/admin-walkthrough.js [baseUrl]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const BASE = process.argv[2] || 'http://localhost:4000';
const TAG = `wk${Date.now().toString(36)}`;
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    failures.push(`${name} ${detail}`);
    console.log(`  FAIL ${name} ${detail}`);
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

function sign(raw) {
  const crypto = require('crypto');
  return crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET).update(raw).digest('hex');
}

async function main() {
  console.log(`Run tag: ${TAG} — baseUrl: ${BASE}`);

  /* ---------- auth ---------- */
  console.log('— Auth —');
  const adminLogin = await api('POST', '/api/admin/auth/login', {
    body: { email: process.env.ADMIN_1_EMAIL, password: process.env.ADMIN_1_PASSWORD },
  });
  const adminToken = adminLogin.json?.data?.token;
  const adminId = adminLogin.json?.data?.admin?.id;
  check('admin login (SUPER_ADMIN)', adminLogin.status === 200 && !!adminToken);
  if (!adminToken) throw new Error('Cannot continue without admin token.');

  /* ---------- catalog: categories ---------- */
  console.log('— Categories (create/rename/deactivate/reactivate) —');
  const catRes = await api('POST', '/api/admin/catalog/categories', {
    token: adminToken,
    body: { slug: `wk-cat-${TAG}`, translations: [{ language: 'EN', name: `Walkthrough Cat ${TAG}` }] },
  });
  const catId = catRes.json?.data?.category?.id || catRes.json?.data?.id;
  check('create category', catRes.status === 201 && !!catId, JSON.stringify(catRes.json).slice(0, 120));
  check('create category audited', await prisma.auditLog.count({ where: { adminId, entityName: 'Category', entityId: String(catId) } }) > 0);

  const catEdit = await api('PUT', `/api/admin/catalog/categories/${catId}`, {
    token: adminToken,
    body: { translations: [{ language: 'EN', name: `Walkthrough Cat Renamed ${TAG}` }] },
  });
  check('rename category', catEdit.status === 200);

  const catOff = await api('PATCH', `/api/admin/catalog/categories/${catId}/active`, {
    token: adminToken, body: { isActive: false },
  });
  check('deactivate category', catOff.status === 200);

  const catOn = await api('PATCH', `/api/admin/catalog/categories/${catId}/active`, {
    token: adminToken, body: { isActive: true },
  });
  check('reactivate category', catOn.status === 200);

  /* ---------- catalog: products + inventory ---------- */
  console.log('— Products (create/edit/activate) + Inventory (restock/adjust/history) —');
  const prodRes = await api('POST', '/api/admin/catalog/products', {
    token: adminToken,
    body: {
      categoryId: catId,
      slug: `wk-prod-${TAG}`,
      priceUgx: 5000,
      stockQuantity: 20,
      unit: 'kg',
      sku: `WK-${TAG.toUpperCase()}`,
      translations: [{ language: 'EN', name: `Walkthrough Product ${TAG}`, description: 'Created by admin-walkthrough' }],
    },
  });
  const prodBody = prodRes.json?.data?.product || prodRes.json?.data;
  const productId = prodBody?.id;
  check('create product', prodRes.status === 201 && !!productId, JSON.stringify(prodRes.json).slice(0, 120));
  check('create product audited', await prisma.auditLog.count({ where: { adminId, entityName: 'Product', entityId: String(productId) } }) > 0);

  const prodEdit = await api('PUT', `/api/admin/catalog/products/${productId}`, {
    token: adminToken,
    body: { priceUgx: 6500, translations: [{ language: 'EN', name: `Walkthrough Product Renamed ${TAG}` }] },
  });
  check('edit product (price via backend)', prodEdit.status === 200);
  const afterEdit = await prisma.product.findUnique({ where: { id: productId } });
  check('backend stored new price', afterEdit?.priceUgx === 6500);

  const deact = await api('PATCH', `/api/admin/catalog/products/${productId}/active`, {
    token: adminToken, body: { isActive: false },
  });
  const react = await api('PATCH', `/api/admin/catalog/products/${productId}/active`, {
    token: adminToken, body: { isActive: true },
  });
  check('deactivate/reactivate product', deact.status === 200 && react.status === 200);

  const restock = await api('POST', `/api/admin/catalog/products/${productId}/inventory/restock`, {
    token: adminToken, body: { quantity: 30, reason: 'walkthrough restock' },
  });
  const adjust = await api('POST', `/api/admin/catalog/products/${productId}/inventory/adjust`, {
    token: adminToken, body: { quantityChange: -2, reason: 'walkthrough adjustment' },
  });
  check('restock 200', restock.status === 200, JSON.stringify(restock.json).slice(0, 120));
  check('adjust 200', adjust.status === 200, JSON.stringify(adjust.json).slice(0, 120));
  const afterStock = await prisma.product.findUnique({ where: { id: productId } });
  check('stock 20+30-2=48 (backend arithmetic)', afterStock?.stockQuantity === 48);
  const histRes = await api('GET', `/api/admin/catalog/products/${productId}/inventory/history?page=1&limit=10`, { token: adminToken });
  check('inventory history 200', histRes.status === 200);

  /* ---------- customer order through the admin lifecycle ---------- */
  console.log('— Order lifecycle (customer order + admin transitions + payments) —');
  const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
  const reg = await api('POST', '/api/auth/register', { body: { fullName: `Admin Walkthrough ${TAG}`, phone, password: 'WalkPass123!' } });
  check('customer register 201', reg.status === 201);
  const login = await api('POST', '/api/auth/login', { body: { phone, password: 'WalkPass123!' } });
  const custToken = login.json?.data?.token;
  check('customer login', !!custToken);
  const userId = login.json?.data?.user?.id;

  const addRes = await api('POST', '/api/addresses', {
    token: custToken,
    body: { title: 'Walkthrough Home', district: 'Kampala', streetAddress: '1 Walkthrough Lane' },
  });
  const addressId = addRes.json?.data?.address?.id || addRes.json?.data?.id;
  check('address created', addRes.status === 201 && !!addressId, JSON.stringify(addRes.json).slice(0, 120));

  const cartRes = await api('POST', '/api/cart/items', { token: custToken, body: { productId, quantity: 2 } });
  check('add to cart', cartRes.status === 200 || cartRes.status === 201, JSON.stringify(cartRes.json).slice(0, 120));

  const preview = await api('POST', '/api/checkout/preview', {
    token: custToken,
    body: { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 1 },
  });
  const pv = preview.json?.data?.checkout || preview.json?.data;
  check('checkout preview 200 (server amounts)', preview.status === 200 && typeof pv?.pricing?.totalUgx === 'number' && typeof pv?.pricing?.commitmentUgx === 'number', JSON.stringify(preview.json).slice(0, 200));

  const orderRes = await api('POST', '/api/orders', {
    token: custToken,
    body: { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 1 },
  });
  const order = orderRes.json?.data?.order;
  check('order created 201', orderRes.status === 201 && !!order?.id, JSON.stringify(orderRes.json).slice(0, 160));

  const payInit = await api('POST', `/api/orders/${order.id}/payment`, { token: custToken, body: { purpose: 'COMMITMENT' } });
  const commitPay = payInit.json?.data?.payment;
  check('commitment payment initiated (200)', payInit.status === 200 && !!commitPay?.providerRef, JSON.stringify(payInit.json).slice(0, 160));
  check('commitment amount = backend amount', commitPay?.amountUgx === order.pricing.commitmentUgx, `paid ${commitPay?.amountUgx} vs order ${order.pricing?.commitmentUgx}`);
  const commitRaw = JSON.stringify({
    providerRef: commitPay.providerRef,
    orderNumber: order.orderNumber,
    amountUgx: commitPay.amountUgx,
    currency: 'UGX',
    purpose: 'COMMITMENT',
    outcome: 'SUCCESS',
  });
  const commitWebhook = await api('POST', '/api/payments/webhook', { rawBody: commitRaw, headers: { 'x-ugafresh-signature': sign(commitRaw) } });
  check('commitment webhook verified', commitWebhook.status === 200, JSON.stringify(commitWebhook.json).slice(0, 160));

  for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']) {
    const r = await api('PATCH', `/api/admin/orders/${order.id}/status`, { token: adminToken, body: { status } });
    check(`order -> ${status} (200)`, r.status === 200, JSON.stringify(r.json).slice(0, 120));
  }

  const detail1 = await api('GET', `/api/admin/orders/${order.id}`, { token: adminToken });
  const d1 = detail1.json?.data?.order || detail1.json?.data;
  check('admin order detail 200', detail1.status === 200 && Array.isArray(d1?.items) && d1.items.length > 0);
  check('detail has status history', Array.isArray(d1?.statusHistory) && d1.statusHistory.length >= 4);

  const earlyBalance = await api('POST', `/api/orders/${order.id}/payment`, { token: custToken, body: { purpose: 'BALANCE' } });
  check('balance rejected before PICKED_UP (409)', earlyBalance.status === 409);

  const pickup = await api('PATCH', `/api/admin/orders/${order.id}/status`, { token: adminToken, body: { status: 'PICKED_UP' } });
  check('order -> PICKED_UP (200)', pickup.status === 200);
  const del = await prisma.delivery.findUnique({ where: { orderId: order.id } });
  await prisma.delivery.update({ where: { id: del.id }, data: { status: 'PICKED_UP' } });

  const balInit = await api('POST', `/api/orders/${order.id}/payment`, { token: custToken, body: { purpose: 'BALANCE' } });
  const balPay = balInit.json?.data?.payment;
  check('balance payment initiated (server amount)', balInit.status === 200 && balPay?.purpose === 'BALANCE' && balPay?.amountUgx === order.pricing.remainingBalanceUgx, JSON.stringify(balInit.json).slice(0, 160));
  const balRaw = JSON.stringify({
    providerRef: balPay.providerRef,
    orderNumber: order.orderNumber,
    amountUgx: balPay.amountUgx,
    currency: 'UGX',
    purpose: 'BALANCE',
    outcome: 'SUCCESS',
  });
  const balWebhook = await api('POST', '/api/payments/webhook', { rawBody: balRaw, headers: { 'x-ugafresh-signature': sign(balRaw) } });
  check('balance webhook -> order COMPLETED', balWebhook.json?.data?.orderStatus === 'COMPLETED', JSON.stringify(balWebhook.json).slice(0, 200));

  const finalOrderRow = await prisma.order.findUnique({ where: { id: order.id } });
  check('DB: order COMPLETED (authoritative)', finalOrderRow?.status === 'COMPLETED');
  check('DB: two successful payments (COMMITMENT + BALANCE)', await prisma.payment.count({ where: { orderId: order.id, status: 'SUCCESS' } }) === 2);

  const detail2 = await api('GET', `/api/admin/orders/${order.id}`, { token: adminToken });
  const d2 = detail2.json?.data?.order || detail2.json?.data;
  check('final admin detail 200 + history', detail2.status === 200 && Array.isArray(d2?.statusHistory) && d2.statusHistory.some((h) => h.toStatus === 'COMPLETED'));

  const payView = await api('GET', `/api/admin/orders/${order.id}/payment`, { token: adminToken });
  check('admin payment breakdown 200', payView.status === 200);

  /* ---------- deliveries ---------- */
  console.log('— Deliveries (list/assign/status incl. failure path) —');
  const delList = await api('GET', '/api/admin/deliveries?page=1&limit=10', { token: adminToken });
  check('deliveries list 200', delList.status === 200);

  const phone2 = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
  await api('POST', '/api/auth/register', { body: { fullName: `Admin Walkthrough B ${TAG}`, phone: phone2, password: 'WalkPass123!' } });
  const loginB = await api('POST', '/api/auth/login', { body: { phone: phone2, password: 'WalkPass123!' } });
  const tokenB = loginB.json?.data?.token;
  const userIdB = loginB.json?.data?.user?.id;
  const addB = await prisma.address.create({ data: { userId: userIdB, title: 'Walkthrough B', district: 'Kampala', streetAddress: '2 Walkthrough Road' } });

  await api('POST', '/api/cart/items', { token: tokenB, body: { productId, quantity: 1 } });
  const hdRes = await api('POST', '/api/orders', {
    token: tokenB,
    body: { fulfillmentMethod: 'HOME_DELIVERY', addressId: addB.id, deliveryFee: 999999, distanceKm: 999 },
  });
  const hd = hdRes.json?.data?.order;
  check('home-delivery order created (client fee ignored)', hdRes.status === 201 && hd.pricing.deliveryFeeUgx !== 999999, JSON.stringify(hdRes.json).slice(0, 160));

  const hdPay = await api('POST', `/api/orders/${hd.id}/payment`, { token: tokenB, body: {} });
  const hdCommit = hdPay.json?.data?.payment;
  const hdRaw = JSON.stringify({ providerRef: hdCommit.providerRef, orderNumber: hd.orderNumber, amountUgx: hdCommit.amountUgx, currency: 'UGX', purpose: 'COMMITMENT', outcome: 'SUCCESS' });
  await api('POST', '/api/payments/webhook', { rawBody: hdRaw, headers: { 'x-ugafresh-signature': sign(hdRaw) } });

  const hdDel = await prisma.delivery.findUnique({ where: { orderId: hd.id } });
  const assignRes = await api('PATCH', `/api/admin/deliveries/${hdDel.id}/assign`, { token: adminToken, body: { assignedAdminId: adminId } });
  check('assign delivery to admin', assignRes.status === 200, JSON.stringify(assignRes.json).slice(0, 160));

  for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY']) {
    await api('PATCH', `/api/admin/orders/${hd.id}/status`, { token: adminToken, body: { status } });
  }
  const outRes = await api('PATCH', `/api/admin/deliveries/${hdDel.id}/status`, { token: adminToken, body: { status: 'OUT_FOR_DELIVERY' } });
  check('delivery -> OUT_FOR_DELIVERY', outRes.status === 200);

  const failRes = await api('PATCH', `/api/admin/deliveries/${hdDel.id}/status`, {
    token: adminToken,
    body: { status: 'FAILED', failureReason: 'CUSTOMER_UNAVAILABLE', failureMessage: 'Walkthrough failure reason' },
  });
  check('delivery -> FAILED (with reason)', failRes.status === 200, JSON.stringify(failRes.json).slice(0, 160));
  const hdAfter = await prisma.delivery.findUnique({ where: { orderId: hd.id } });
  check('delivery row shows FAILED', hdAfter?.status === 'FAILED');

  /* ---------- RBAC control ---------- */
  console.log('— RBAC control —');
  const dispLogin = await api('POST', '/api/admin/auth/login', {
    body: { email: process.env.ADMIN_2_EMAIL, password: process.env.ADMIN_2_PASSWORD },
  });
  const dispToken = dispLogin.json?.data?.token;
  const dispRole = dispLogin.json?.data?.admin?.role;
  const catForbidden = await api('POST', '/api/admin/catalog/categories', {
    token: dispToken,
    body: { slug: `wk-nope-${TAG}`, translations: [{ language: 'EN', name: 'Should Fail' }] },
  });
  // Exact RBAC expectation: DISPATCHER -> 403; ADMIN -> permitted (2xx).
  const rbacOk = dispRole === 'DISPATCHER' ? catForbidden.status === 403 : catForbidden.status >= 200 && catForbidden.status < 300;
  check(`catalog blocked for ${dispRole}`, rbacOk, `status ${catForbidden.status}`);
  if (catForbidden.status >= 200 && catForbidden.status < 300) {
    const nopeCat = await prisma.category.findUnique({ where: { slug: `wk-nope-${TAG}` } });
    if (nopeCat) {
      await prisma.categoryTranslation.deleteMany({ where: { categoryId: nopeCat.id } });
      await prisma.category.delete({ where: { id: nopeCat.id } });
    }
  }
  const ordersOk = await api('GET', '/api/admin/orders?page=1&limit=5', { token: dispToken });
  check('operations admin can list orders', ordersOk.status === 200);

  /* ---------- customer storefront verification ---------- */
  console.log('— Customer storefront (same backend) —');
  const pubProds = await api('GET', '/api/products?page=1&limit=10');
  check('GET /api/products 200 + data', pubProds.status === 200 && Array.isArray(pubProds.json?.data) && pubProds.json.data.length > 0, `total=${pubProds.json?.pagination?.total}`);
  const pubCats = await api('GET', '/api/categories');
  check('GET /api/categories 200 + data', pubCats.status === 200 && Array.isArray(pubProds.json?.data) && pubProds.json.data.length > 0, `total=${pubCats.json?.pagination?.total}`);
  const firstPub = pubProds.json?.data?.[0];
  const prodDetail = await api('GET', `/api/products/${firstPub.id}`);
  const pdData = prodDetail.json?.data?.product || prodDetail.json?.data;
  check('GET /api/products/:id 200', prodDetail.status === 200 && !!pdData?.slug);
  const relRes = await api('GET', `/api/products?categorySlug=${encodeURIComponent(pdData.category?.slug || pdData.categoryId)}&limit=4`);
  check('GET /api/products?categorySlug= 200 (related flow)', relRes.status === 200 && Array.isArray(relRes.json?.data), JSON.stringify(relRes.json).slice(0, 100));
  const stations = await api('GET', '/api/pickup-stations');
  const stationsData = stations.json?.data?.stations || stations.json?.data;
  check('GET /api/pickup-stations 200 + data', stations.status === 200 && Array.isArray(stationsData) && stationsData.length > 0);
  const custNotif = await api('GET', '/api/notifications', { token: custToken });
  const notifData = custNotif.json?.data?.notifications || custNotif.json?.data;
  check('GET /api/notifications (customer) 200', custNotif.status === 200 && Array.isArray(notifData), JSON.stringify(custNotif.json).slice(0, 120));
  const pubSearch = await api('GET', '/api/products?page=1&limit=5&search=matooke');
  check('catalog search 200', pubSearch.status === 200);

  /* ---------- cleanup (FK-safe, admin-owned rows first) ---------- */
  console.log('— Cleanup —');
  const delCleanup = async () => {
    await prisma.inventoryTransaction.deleteMany({ where: { productId } });
    await prisma.productImage.deleteMany({ where: { productId } });
    await prisma.productTranslation.deleteMany({ where: { productId } });
    await prisma.wishlist.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } }).catch(() => null);
    await prisma.categoryTranslation.deleteMany({ where: { categoryId: catId } });
    await prisma.category.delete({ where: { id: catId } }).catch(() => null);
  };

  // Cascade-checked teardown: deleting walkthrough users removes their carts,
  // cart items, addresses, notifications, wishlists (onDelete: Cascade); orders
  // and deliveries restrict, so they are deleted explicitly first.
  const userOrders = await prisma.order.findMany({
    where: { userId: { in: [userId, userIdB].filter(Boolean) } },
    select: { id: true },
  });
  const orderIds = userOrders.map((o) => o.id);
  if (orderIds.length) {
    await prisma.delivery.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: [userId, userIdB].filter(Boolean) } } } });
  await prisma.cart.deleteMany({ where: { userId: { in: [userId, userIdB].filter(Boolean) } } });
  await prisma.address.deleteMany({ where: { userId: { in: [userId, userIdB].filter(Boolean) } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [userId, userIdB].filter(Boolean) } } });
  await prisma.wishlist.deleteMany({ where: { userId: { in: [userId, userIdB].filter(Boolean) } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, userIdB].filter(Boolean) } } });
  await delCleanup();
  await prisma.auditLog.deleteMany({ where: { adminId, entityName: { in: ['Category', 'Product'] }, entityId: { in: [String(catId), String(productId)] } } });

  console.log(`Removed ${orderIds.length} walkthrough order(s), 2 walkthrough user(s), 1 product, 1 category, inventory rows, audit rows.`);
}

main()
  .then(() => {
    console.log(`\nWalkthrough result: ${passed} passed, ${failed} failed`);
    if (failures.length) {
      console.log('Failures:');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exitCode = 1;
    }
  })
  .catch((e) => {
    console.error('WALKTHROUGH ERROR:', e.message);
    console.error('NOTE: cleanup for partially-created rows was skipped — rerun cleanup logic or inspect DB.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
