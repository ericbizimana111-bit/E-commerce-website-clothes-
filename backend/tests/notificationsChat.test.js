/**
 * Staff notifications, customer notifications, real-time tickets and the
 * customer <-> staff chat.
 */
const http = require('http');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signAdminToken } = require('../src/services/token.service');
const { signMockWebhook } = require('../src/services/paymentProviders/mockProvider');
const realtime = require('../src/services/realtime.service');
const { createTestAddress } = require('./helpers/fixtures');

jest.setTimeout(60000);

describe('Notifications, real-time & chat', () => {
  let adminToken = null;
  let adminId = null;
  let dispatcherToken = null;
  let dispatcherId = null;
  let customer = null;
  let other = null;
  let product = null;
  const createdUserIds = [];
  const createdOrderIds = [];

  async function makeCustomer(name) {
    for (let i = 0; i < 5; i++) {
      const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
      const reg = await request(app).post('/api/auth/register').send({ fullName: `${name} ${i}`, phone, password: 'NotifPass123!' });
      if (reg.statusCode === 409) continue;
      const id = reg.body.data.user.id;
      createdUserIds.push(id);
      // Mobile money (Flutterwave) requires a real customer email.
      await prisma.user.update({ where: { id }, data: { email: `notify.${id.slice(0, 8)}@test.ug` } });
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'NotifPass123!' });
      const address = await createTestAddress(id);
      return { token: login.body.data.token, id, addressId: address.id };
    }
    throw new Error('could not create customer');
  }

  async function placeOrder(c) {
    await request(app).post('/api/cart/items').set('Authorization', `Bearer ${c.token}`).send({ productId: product.id, quantity: 1 });
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${c.token}`).send({ addressId: c.addressId });
    expect(res.statusCode).toBe(201);
    createdOrderIds.push(res.body.data.order.id);
    return res.body.data.order;
  }

  beforeAll(async () => {
    const login = await request(app).post('/api/admin/auth/login').send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    adminToken = login.body.data.token;
    adminId = login.body.data.admin ? login.body.data.admin.id : (await prisma.admin.findUnique({ where: { email: env.ADMIN_1_EMAIL } })).id;

    const dispatcher = await prisma.admin.upsert({
      where: { email: 'dispatcher.notify@ugandafood.market' },
      update: { role: 'DISPATCHER', isActive: true },
      create: {
        fullName: 'Notify Dispatcher',
        email: 'dispatcher.notify@ugandafood.market',
        passwordHash: '$2a$12$eXampleHashedPasswordForTestOnly999999999999999999999999',
        role: 'DISPATCHER',
        isActive: true,
      },
    });
    dispatcherId = dispatcher.id;
    dispatcherToken = signAdminToken(dispatcher);

    customer = await makeCustomer('Notify Customer');
    other = await makeCustomer('Notify Other');

    const category = await prisma.category.findFirst();
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'notify-test-' + Date.now(),
        priceUgx: 25000,
        stockQuantity: 50,
        isActive: true,
        nameEn: 'Notify Test Item',
        translations: { create: [{ language: 'EN', name: 'Notify Test Item' }] },
      },
    });
  });

  afterAll(async () => {
    for (const oid of createdOrderIds) {
      await prisma.adminNotification.deleteMany({ where: { orderId: oid } });
      await prisma.chatMessage.deleteMany({ where: { orderId: oid } });
      await prisma.auditLog.deleteMany({ where: { entityId: oid } });
      await prisma.payment.deleteMany({ where: { orderId: oid } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
      await prisma.delivery.deleteMany({ where: { orderId: oid } });
      await prisma.orderItem.deleteMany({ where: { orderId: oid } });
      await prisma.order.deleteMany({ where: { id: oid } });
    }
    const convs = await prisma.conversation.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
    for (const c of convs) {
      await prisma.adminNotification.deleteMany({ where: { metadata: { path: ['conversationId'], equals: c.id } } });
    }
    for (const uid of createdUserIds) {
      await prisma.cartItem.deleteMany({ where: { cart: { userId: uid } } });
      await prisma.cart.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.productTranslation.deleteMany({ where: { productId: product.id } });
    await prisma.product.deleteMany({ where: { id: product.id } });
    await prisma.$disconnect();
  });

  describe('order notifications', () => {
    test('new order immediately notifies staff with dispatch details', async () => {
      const order = await placeOrder(customer);
      const n = await prisma.adminNotification.findFirst({ where: { orderId: order.id, type: 'NEW_ORDER' } });
      expect(n).not.toBeNull();
      expect(n.title).toContain(order.orderNumber);
      expect(n.message).toMatch(/Notify Customer/);
      expect(n.message).toMatch(/Ntinda, Kampala/);
      expect(n.linkUrl).toBe(`/orders/${order.id}`);
      expect(n.metadata).toMatchObject({ district: 'Kampala', area: 'Ntinda', customerPhone: '+256772000111' });
      expect(n.metadata.distanceKm).toBeGreaterThan(0);

      // ...and confirms receipt to the customer
      const mine = await request(app).get('/api/notifications').set('Authorization', `Bearer ${customer.token}`);
      expect(mine.body.data.notifications.some((x) => x.title === 'Order received' && x.linkUrl === `/account/orders/${order.id}`)).toBe(true);
      expect(mine.body.data.unread).toBeGreaterThan(0);
    });

    test('staff feed is listable with per-admin read state', async () => {
      const list = await request(app).get('/api/admin/notifications?limit=5').set('Authorization', `Bearer ${adminToken}`);
      expect(list.statusCode).toBe(200);
      expect(list.body.data.items.length).toBeGreaterThan(0);
      const first = list.body.data.items[0];

      const read = await request(app).patch('/api/admin/notifications/read').set('Authorization', `Bearer ${adminToken}`).send({ ids: [first.id] });
      expect(read.statusCode).toBe(200);

      // Another staff member still sees it unread
      const dispatcherList = await request(app).get('/api/admin/notifications?limit=50').set('Authorization', `Bearer ${dispatcherToken}`);
      const same = dispatcherList.body.data.items.find((x) => x.id === first.id);
      expect(same.isRead).toBe(false);

      const all = await request(app).patch('/api/admin/notifications/read-all').set('Authorization', `Bearer ${adminToken}`);
      expect(all.body.data.unread).toBe(0);
      const count = await request(app).get('/api/admin/notifications/unread-count').set('Authorization', `Bearer ${adminToken}`);
      expect(count.body.data.unread).toBe(0);
    });

    test('deposit payment notifies staff and customer', async () => {
      const order = await placeOrder(customer);
      const init = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customer.token}`).send({ method: 'AIRTEL_MONEY' });
      expect(init.statusCode).toBe(200);
      const payment = init.body.data.payment;
      const body = { providerRef: payment.providerRef, orderNumber: order.orderNumber, amountUgx: payment.amountUgx, currency: 'UGX', purpose: 'COMMITMENT', outcome: 'SUCCESS' };
      const raw = JSON.stringify(body);
      const hook = await request(app).post('/api/payments/webhook').set('x-ugafresh-signature', signMockWebhook(raw)).set('Content-Type', 'application/json').send(raw);
      expect(hook.statusCode).toBe(200);

      const staff = await prisma.adminNotification.findFirst({ where: { orderId: order.id, type: 'PAYMENT_RECEIVED' } });
      expect(staff).not.toBeNull();
      expect(staff.message).toMatch(/Airtel Money/);
      const cust = await prisma.notification.findFirst({ where: { userId: customer.id, title: 'Deposit received' } });
      expect(cust).not.toBeNull();
    });

    test('card payments are rejected (mobile money only)', async () => {
      const order = await placeOrder(customer);
      const res = await request(app).post(`/api/orders/${order.id}/payment`).set('Authorization', `Bearer ${customer.token}`).send({ method: 'CARD' });
      expect(res.statusCode).toBe(400);
    });

    test('customer can mark all notifications read', async () => {
      const res = await request(app).patch('/api/notifications/read-all').set('Authorization', `Bearer ${customer.token}`);
      expect(res.statusCode).toBe(200);
      const count = await request(app).get('/api/notifications/unread-count').set('Authorization', `Bearer ${customer.token}`);
      expect(count.body.data.unread).toBe(0);
    });
  });

  describe('real-time stream', () => {
    test('ticket requires auth; admin and customer tickets subscribe to the right channels', async () => {
      expect((await request(app).post('/api/realtime/ticket')).statusCode).toBe(401);
      expect((await request(app).get('/api/realtime/stream?ticket=forged')).statusCode).toBe(401);

      const t = await request(app).post('/api/realtime/ticket').set('Authorization', `Bearer ${adminToken}`);
      expect(t.statusCode).toBe(200);
      expect(realtime.verifyTicket(t.body.data.ticket).kind).toBe('ADMIN');

      const c = await request(app).post('/api/realtime/ticket').set('Authorization', `Bearer ${customer.token}`);
      const claims = realtime.verifyTicket(c.body.data.ticket);
      expect(claims.kind).toBe('CUSTOMER');
      expect(claims.sub).toBe(customer.id);
    });

    test('SSE stream delivers a published event', async () => {
      const t = await request(app).post('/api/realtime/ticket').set('Authorization', `Bearer ${customer.token}`);
      const server = http.createServer(app).listen(0);
      const port = server.address().port;
      try {
        const received = await new Promise((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${port}/api/realtime/stream?ticket=${encodeURIComponent(t.body.data.ticket)}`, (res) => {
            expect(res.headers['content-type']).toMatch(/text\/event-stream/);
            let buf = '';
            res.on('data', (chunk) => {
              buf += chunk.toString();
              if (buf.includes('event: ready')) realtime.publish(`user:${customer.id}`, 'notification', { hello: 'world' });
              if (buf.includes('"hello":"world"')) {
                req.destroy();
                resolve(buf);
              }
            });
          });
          req.on('error', (e) => (e.code === 'ECONNRESET' ? null : reject(e)));
          setTimeout(() => reject(new Error('no event received')), 5000);
        });
        expect(received).toMatch(/event: notification/);
      } finally {
        server.closeAllConnections();
        server.close();
      }
    });
  });

  describe('chat', () => {
    let conversationId = null;

    test('customer sends a message about their order; staff are notified once per unread burst', async () => {
      const order = await placeOrder(customer);
      const send = await request(app)
        .post('/api/chat/messages')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ body: '  When will my order arrive?  ', orderId: order.id });
      expect(send.statusCode).toBe(201);
      expect(send.body.data.message.body).toBe('When will my order arrive?');
      expect(send.body.data.message.order.orderNumber).toBe(order.orderNumber);
      conversationId = send.body.data.message.conversationId;

      await request(app).post('/api/chat/messages').set('Authorization', `Bearer ${customer.token}`).send({ body: 'Second message' });
      const notes = await prisma.adminNotification.findMany({ where: { type: 'NEW_MESSAGE', metadata: { path: ['conversationId'], equals: conversationId } } });
      expect(notes).toHaveLength(1);

      const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
      expect(convo.adminUnread).toBe(2);
    });

    test('customer cannot reference another customer\'s order', async () => {
      const foreign = await placeOrder(other);
      const res = await request(app).post('/api/chat/messages').set('Authorization', `Bearer ${customer.token}`).send({ body: 'hi', orderId: foreign.id });
      expect(res.statusCode).toBe(404);
    });

    test('empty and oversized messages are rejected', async () => {
      expect((await request(app).post('/api/chat/messages').set('Authorization', `Bearer ${customer.token}`).send({ body: '   ' })).statusCode).toBe(400);
      expect((await request(app).post('/api/chat/messages').set('Authorization', `Bearer ${customer.token}`).send({ body: 'x'.repeat(2300) })).statusCode).toBe(400);
    });

    test('staff see the conversation with order context and reply', async () => {
      const list = await request(app).get('/api/admin/chat/conversations?unread=true').set('Authorization', `Bearer ${dispatcherToken}`);
      expect(list.statusCode).toBe(200);
      expect(list.body.data.items.some((c) => c.id === conversationId)).toBe(true);
      expect(list.body.data.unreadTotal).toBeGreaterThanOrEqual(2);

      const thread = await request(app).get(`/api/admin/chat/conversations/${conversationId}`).set('Authorization', `Bearer ${dispatcherToken}`);
      expect(thread.body.data.messages).toHaveLength(2);
      expect(thread.body.data.context.recentOrders.length).toBeGreaterThan(0);
      expect(thread.body.data.conversation.customer.phone).toBeDefined();

      const reply = await request(app)
        .post(`/api/admin/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ body: 'Your order is on the way today.' });
      expect(reply.statusCode).toBe(201);
      expect(reply.body.data.message.senderType).toBe('ADMIN');
      expect(reply.body.data.message.senderName).toBe('Notify Dispatcher');

      const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
      expect(convo.adminUnread).toBe(0); // replying marks staff side read
      expect(convo.customerUnread).toBe(1);
      const custNote = await prisma.notification.findFirst({ where: { userId: customer.id, type: 'NEW_MESSAGE' } });
      expect(custNote).not.toBeNull();
    });

    test('customer thread shows the reply and can be marked read', async () => {
      const unread = await request(app).get('/api/chat/unread-count').set('Authorization', `Bearer ${customer.token}`);
      expect(unread.body.data.unread).toBe(1);
      const thread = await request(app).get('/api/chat').set('Authorization', `Bearer ${customer.token}`);
      expect(thread.body.data.messages.map((m) => m.senderType)).toEqual(['CUSTOMER', 'CUSTOMER', 'ADMIN']);
      await request(app).post('/api/chat/read').set('Authorization', `Bearer ${customer.token}`);
      const after = await request(app).get('/api/chat/unread-count').set('Authorization', `Bearer ${customer.token}`);
      expect(after.body.data.unread).toBe(0);
    });

    test('staff can open a conversation with any customer; customers cannot use staff endpoints', async () => {
      const open = await request(app).post('/api/admin/chat/conversations').set('Authorization', `Bearer ${adminToken}`).send({ userId: other.id });
      expect(open.statusCode).toBe(200);
      expect(open.body.data.conversation.id).toBeDefined();
      expect((await request(app).get('/api/admin/chat/conversations').set('Authorization', `Bearer ${customer.token}`)).statusCode).toBe(401);
      expect((await request(app).get('/api/chat')).statusCode).toBe(401);
    });
  });
});
