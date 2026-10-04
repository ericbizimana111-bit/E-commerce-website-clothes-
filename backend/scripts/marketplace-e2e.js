/* Marketplace end-to-end HTTP check against a RUNNING API (npm run dev).
 *
 * Exercises the real stack including live geocoding/routing when enabled:
 *   customer registers -> validated address -> order -> staff notified live
 *   (SSE) -> deposit webhook -> chat both ways -> home-service booking ->
 *   staff confirm/assign/complete/payment -> cleanup.
 *
 * Usage:  node scripts/marketplace-e2e.js   (API on http://localhost:4000)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const http = require('http');
const crypto = require('crypto');

const BASE = process.env.E2E_BASE || 'http://localhost:4000';
let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function api(method, path, { token, body, headers, rawBody } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers || {}) },
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

/** Open the SSE stream and collect events until stop() is called. */
function openStream(ticket) {
  const events = [];
  let req;
  const ready = new Promise((resolve, reject) => {
    req = http.get(`${BASE}/api/realtime/stream?ticket=${encodeURIComponent(ticket)}`, (res) => {
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = /event: (.+)/.exec(block);
          const data = /data: (.+)/.exec(block);
          if (ev) {
            events.push({ event: ev[1], data: data ? JSON.parse(data[1]) : null });
            if (ev[1] === 'ready') resolve();
          }
        }
      });
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' ? null : reject(e)));
  });
  return { events, ready, stop: () => req && req.destroy() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(150);
  }
  return null;
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const sign = (raw) => crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET).update(raw).digest('hex');
  let userId = null;
  let orderId = null;
  let requestId = null;
  let providerId = null;
  let streams = [];

  try {
    console.log('— 1. Setup —');
    const health = await api('GET', '/api/health');
    check('API is up', health.status === 200, JSON.stringify(health.json));

    const adminLogin = await api('POST', '/api/admin/auth/login', { body: { email: process.env.ADMIN_1_EMAIL, password: process.env.ADMIN_1_PASSWORD } });
    const adminToken = adminLogin.json?.data?.token;
    check('admin login', !!adminToken);

    const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
    const reg = await api('POST', '/api/auth/register', { body: { fullName: 'E2E Shopper', phone, email: `e2e.${Date.now()}@test.ug`, password: 'E2ePass123!' } });
    check('customer registered', reg.status === 201, JSON.stringify(reg.json));
    userId = reg.json?.data?.user?.id;
    const token = (await api('POST', '/api/auth/login', { body: { phone, password: 'E2ePass123!' } })).json?.data?.token;

    // Live stream for staff and customer
    const adminTicket = (await api('POST', '/api/realtime/ticket', { token: adminToken })).json?.data?.ticket;
    const custTicket = (await api('POST', '/api/realtime/ticket', { token })).json?.data?.ticket;
    const adminStream = openStream(adminTicket);
    const custStream = openStream(custTicket);
    streams = [adminStream, custStream];
    await Promise.all([adminStream.ready, custStream.ready]);
    check('admin + customer SSE streams connected', true);

    console.log('— 2. Validated address —');
    const search = await api('GET', '/api/locations/search?q=Ntinda');
    check('location search finds Ntinda', (search.json?.data?.results || []).some((r) => /Ntinda/.test(r.label)), JSON.stringify(search.json?.data));
    const reverse = await api('GET', '/api/locations/reverse?lat=0.3545&lng=32.6152');
    check('reverse geocode → Kampala', reverse.json?.data?.district === 'Kampala', JSON.stringify(reverse.json?.data));
    const wrong = await api('POST', '/api/addresses', {
      token,
      body: { district: 'Gulu', streetAddress: 'Plot 4 Kigoowa Rd', contactPhone: '0772123456', latitude: 0.3545, longitude: 32.6152 },
    });
    check('mismatched district rejected', wrong.status === 422, JSON.stringify(wrong.json));
    const addr = await api('POST', '/api/addresses', {
      token,
      body: { title: 'Home', district: 'Kampala', division: 'Ntinda', streetAddress: 'Plot 4 Kigoowa Rd, blue gate', landmark: 'Opposite the church', contactPhone: '0772123456', latitude: 0.3545, longitude: 32.6152 },
    });
    check('valid address saved', addr.status === 201, JSON.stringify(addr.json));
    console.log(`     verified by geocoder: ${addr.json?.data?.address?.isVerified} · ${addr.json?.data?.address?.formattedAddress}`);
    const addressId = addr.json?.data?.address?.id;

    console.log('— 3. Order → staff notified live —');
    const product = await prisma.product.findFirst({ where: { isActive: true, stockQuantity: { gt: 5 }, category: { isActive: true } } });
    await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 1 } });
    const preview = await api('POST', '/api/checkout/preview', { token, body: { addressId } });
    const f = preview.json?.data?.checkout?.fulfillment;
    check('checkout preview has distance, ETA and fee', f?.distanceKm > 0 && f?.etaMinutes > 0 && f?.deliveryFeeUgx > 0, JSON.stringify(f));
    console.log(`     ${f?.distanceKm} km (${f?.distanceSource}) · ${f?.etaMinutes} min · fee UGX ${f?.deliveryFeeUgx}`);
    const order = await api('POST', '/api/orders', { token, body: { addressId } });
    check('order placed', order.status === 201, JSON.stringify(order.json));
    orderId = order.json?.data?.order?.id;
    const live = await waitFor(() => adminStream.events.find((e) => e.event === 'notification' && e.data?.orderId === orderId && e.data?.type === 'NEW_ORDER'));
    check('staff received NEW_ORDER live over SSE', !!live);
    if (live) console.log(`     "${live.data.title}" — ${live.data.message}`);
    const route = await api('GET', `/api/admin/orders/${orderId}/route`, { token: adminToken });
    check('admin route map data', route.json?.data?.route?.geometry?.length >= 2, JSON.stringify(route.json).slice(0, 200));

    console.log('— 4. Deposit via signed webhook —');
    const pay = await api('POST', `/api/orders/${orderId}/payment`, { token, body: { method: 'MTN_MOBILE_MONEY' } });
    const p = pay.json?.data?.payment;
    check('mobile money payment initiated', pay.status === 200, JSON.stringify(pay.json));
    const card = await api('POST', `/api/orders/${orderId}/payment`, { token, body: { method: 'CARD' } });
    check('card payment refused', card.status === 400);
    const raw = JSON.stringify({ providerRef: p.providerRef, orderNumber: order.json.data.order.orderNumber, amountUgx: p.amountUgx, currency: 'UGX', purpose: 'COMMITMENT', outcome: 'SUCCESS' });
    const hook = await api('POST', '/api/payments/webhook', { rawBody: raw, headers: { 'x-ugafresh-signature': sign(raw) } });
    check('webhook accepted', hook.status === 200, JSON.stringify(hook.json));
    check('staff notified of payment', !!(await waitFor(() => adminStream.events.find((e) => e.data?.type === 'PAYMENT_RECEIVED' && e.data?.orderId === orderId))));
    check('customer notified of deposit', !!(await waitFor(() => custStream.events.find((e) => e.event === 'notification' && e.data?.title === 'Deposit received'))));

    console.log('— 5. Chat —');
    const msg = await api('POST', '/api/chat/messages', { token, body: { body: 'Hello, please call before arriving.', orderId } });
    check('customer message sent', msg.status === 201);
    const convoId = msg.json?.data?.message?.conversationId;
    check('staff receive chat live', !!(await waitFor(() => adminStream.events.find((e) => e.event === 'chat:message' && e.data?.message?.body?.startsWith('Hello')))));
    const reply = await api('POST', `/api/admin/chat/conversations/${convoId}/messages`, { token: adminToken, body: { body: 'Sure, the rider will call you.' } });
    check('staff reply sent', reply.status === 201);
    check('customer receives reply live', !!(await waitFor(() => custStream.events.find((e) => e.event === 'chat:message' && e.data?.message?.senderType === 'ADMIN'))));

    console.log('— 6. Home service booking —');
    const services = await api('GET', '/api/services');
    const plumbing = (services.json?.data?.services || []).find((s) => s.slug === 'plumbing');
    check('service catalogue available', !!plumbing);
    const date = new Date(Date.now() + 3 * 3600e3 + 86400e3).toISOString().slice(0, 10);
    const booking = await api('POST', '/api/service-requests', { token, body: { serviceId: plumbing.id, addressId, description: 'Kitchen sink is leaking badly', preferredDate: date, preferredSlot: 'MORNING' } });
    check('booking created', booking.status === 201, JSON.stringify(booking.json));
    requestId = booking.json?.data?.request?.id;
    check('staff notified of booking live', !!(await waitFor(() => adminStream.events.find((e) => e.data?.type === 'NEW_SERVICE_REQUEST'))));
    const tech = await api('POST', '/api/admin/services/providers', { token: adminToken, body: { fullName: 'E2E Plumber', phone: '0701999888', serviceIds: [plumbing.id] } });
    providerId = tech.json?.data?.provider?.id;
    await api('PATCH', `/api/admin/services/requests/${requestId}`, { token: adminToken, body: { status: 'CONFIRMED', quotedPriceUgx: 40000 } });
    await api('PATCH', `/api/admin/services/requests/${requestId}`, { token: adminToken, body: { providerId } });
    await api('PATCH', `/api/admin/services/requests/${requestId}`, { token: adminToken, body: { status: 'IN_PROGRESS' } });
    const done = await api('PATCH', `/api/admin/services/requests/${requestId}`, { token: adminToken, body: { status: 'COMPLETED' } });
    check('booking completed by staff', done.json?.data?.request?.status === 'COMPLETED', JSON.stringify(done.json).slice(0, 200));
    const paid = await api('POST', `/api/admin/services/requests/${requestId}/payment`, { token: adminToken, body: { method: 'AIRTEL_MONEY', reference: 'AT-E2E-0001' } });
    check('service payment recorded', paid.json?.data?.request?.paymentStatus === 'PAID');
    check('customer got service updates live', custStream.events.filter((e) => e.event === 'notification' && /Technician assigned|Service completed/.test(e.data?.title)).length >= 2);

    const summary = await api('GET', '/api/admin/dashboard/summary', { token: adminToken });
    check('dashboard summary', summary.status === 200 && Array.isArray(summary.json?.data?.trend));
  } catch (error) {
    failed++;
    console.log('  ❌ unexpected error', error);
  } finally {
    streams.forEach((s) => s.stop());
    // Cleanup everything this run created.
    if (orderId) {
      await prisma.adminNotification.deleteMany({ where: { orderId } });
      await prisma.chatMessage.deleteMany({ where: { orderId } });
      await prisma.auditLog.deleteMany({ where: { entityId: orderId } });
      await prisma.payment.findMany({ where: { orderId } }).then((ps) => prisma.auditLog.deleteMany({ where: { entityId: { in: ps.map((x) => x.id) } } }));
      await prisma.payment.deleteMany({ where: { orderId } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
      const items = await prisma.orderItem.findMany({ where: { orderId } });
      for (const it of items) await prisma.product.update({ where: { id: it.productId }, data: { stockQuantity: { increment: Math.trunc(Number(it.quantity)) } } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: orderId } });
      await prisma.delivery.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.deleteMany({ where: { id: orderId } });
    }
    if (requestId) {
      await prisma.adminNotification.deleteMany({ where: { linkUrl: `/service-requests/${requestId}` } });
      await prisma.auditLog.deleteMany({ where: { entityId: requestId } });
      await prisma.serviceRequest.deleteMany({ where: { id: requestId } });
    }
    if (providerId) {
      await prisma.auditLog.deleteMany({ where: { entityId: providerId } });
      await prisma.serviceProvider.deleteMany({ where: { id: providerId } });
    }
    if (userId) {
      const convo = await prisma.conversation.findUnique({ where: { userId } });
      if (convo) await prisma.adminNotification.deleteMany({ where: { metadata: { path: ['conversationId'], equals: convo.id } } });
      await prisma.cartItem.deleteMany({ where: { cart: { userId } } });
      await prisma.cart.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
})();
