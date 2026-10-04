/**
 * Home services: catalogue, technicians, customer bookings and the staff
 * booking lifecycle (confirm -> assign -> in progress -> complete -> paid).
 */
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signAdminToken } = require('../src/services/token.service');
const { createTestAddress } = require('./helpers/fixtures');

jest.setTimeout(60000);

function kampalaDate(daysAhead) {
  const d = new Date(Date.now() + 3 * 3600 * 1000 + daysAhead * 86400000);
  return d.toISOString().slice(0, 10);
}

describe('Home services', () => {
  let adminToken = null;
  let dispatcherToken = null;
  let customer = null;
  let other = null;
  let service = null;
  let provider = null;
  let requestId = null;
  const createdUserIds = [];
  const createdServiceIds = [];
  const createdProviderIds = [];

  async function makeCustomer(name) {
    for (let i = 0; i < 5; i++) {
      const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
      const reg = await request(app).post('/api/auth/register').send({ fullName: `${name} ${i}`, phone, password: 'ServPass123!' });
      if (reg.statusCode === 409) continue;
      const id = reg.body.data.user.id;
      createdUserIds.push(id);
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'ServPass123!' });
      const address = await createTestAddress(id);
      return { token: login.body.data.token, id, addressId: address.id };
    }
    throw new Error('could not create customer');
  }

  const book = (c, body = {}) =>
    request(app)
      .post('/api/service-requests')
      .set('Authorization', `Bearer ${c.token}`)
      .send({
        serviceId: service.id,
        addressId: c.addressId,
        description: 'Kitchen sink pipe is leaking under the cabinet',
        preferredDate: kampalaDate(1),
        preferredSlot: 'MORNING',
        ...body,
      });

  beforeAll(async () => {
    const login = await request(app).post('/api/admin/auth/login').send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    adminToken = login.body.data.token;
    const dispatcher = await prisma.admin.upsert({
      where: { email: 'dispatcher.services@ugandafood.market' },
      update: { role: 'DISPATCHER', isActive: true },
      create: {
        fullName: 'Services Dispatcher',
        email: 'dispatcher.services@ugandafood.market',
        passwordHash: '$2a$12$eXampleHashedPasswordForTestOnly999999999999999999999999',
        role: 'DISPATCHER',
        isActive: true,
      },
    });
    dispatcherToken = signAdminToken(dispatcher);
    customer = await makeCustomer('Service Customer');
    other = await makeCustomer('Service Other');
  });

  afterAll(async () => {
    const reqs = await prisma.serviceRequest.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
    for (const r of reqs) {
      await prisma.adminNotification.deleteMany({ where: { linkUrl: `/service-requests/${r.id}` } });
      await prisma.auditLog.deleteMany({ where: { entityId: r.id } });
    }
    await prisma.serviceRequest.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.serviceProvider.deleteMany({ where: { id: { in: createdProviderIds } } });
    await prisma.auditLog.deleteMany({ where: { entityName: { in: ['Service', 'ServiceProvider'] }, entityId: { in: [...createdServiceIds.map(String), ...createdProviderIds] } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    for (const uid of createdUserIds) await prisma.user.deleteMany({ where: { id: uid } });
    await prisma.$disconnect();
  });

  describe('catalogue & technicians (staff)', () => {
    test('admin creates a service with English only; slug is generated', async () => {
      const res = await request(app)
        .post('/api/admin/services/catalog')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Test Plumbing ${Date.now()}`, description: 'Leaks, taps and pipes', icon: 'wrench', priceType: 'INSPECTION', priceFromUgx: 20000, durationText: '1-2 hours' });
      expect(res.statusCode).toBe(201);
      service = res.body.data.service;
      createdServiceIds.push(service.id);
      expect(service.slug).toMatch(/^test-plumbing-\d+$/);
      expect(service.priceFromUgx).toBe(20000);
    });

    test('dispatchers cannot edit the catalogue', async () => {
      const res = await request(app).post('/api/admin/services/catalog').set('Authorization', `Bearer ${dispatcherToken}`).send({ name: 'Nope service' });
      expect(res.statusCode).toBe(403);
    });

    test('technician phone is validated; skills link to services', async () => {
      const bad = await request(app).post('/api/admin/services/providers').set('Authorization', `Bearer ${adminToken}`).send({ fullName: 'Bad Phone', phone: '0123456789' });
      expect(bad.statusCode).toBe(422);

      const res = await request(app)
        .post('/api/admin/services/providers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Okello James', phone: '0701 222333', coverage: 'Kampala, Wakiso', serviceIds: [service.id] });
      expect(res.statusCode).toBe(201);
      provider = res.body.data.provider;
      createdProviderIds.push(provider.id);
      expect(provider.phone).toBe('+256701222333');
      expect(provider.services.map((s) => s.id)).toEqual([service.id]);

      const filtered = await request(app).get(`/api/admin/services/providers?serviceId=${service.id}`).set('Authorization', `Bearer ${dispatcherToken}`);
      expect(filtered.body.data.providers.some((p) => p.id === provider.id)).toBe(true);
    });

    test('public catalogue lists active services', async () => {
      const res = await request(app).get('/api/services');
      expect(res.statusCode).toBe(200);
      expect(res.body.data.services.some((s) => s.id === service.id)).toBe(true);
      expect(res.body.data.timeSlots.MORNING).toBeDefined();
      const one = await request(app).get(`/api/services/${service.slug}`);
      expect(one.body.data.service.name).toBe(service.name);
    });
  });

  describe('customer booking', () => {
    test('validation: past date, bad slot, short description, foreign address', async () => {
      expect((await book(customer, { preferredDate: kampalaDate(-1) })).statusCode).toBe(422);
      expect((await book(customer, { preferredDate: kampalaDate(90) })).statusCode).toBe(422);
      expect((await book(customer, { preferredSlot: 'MIDNIGHT' })).statusCode).toBe(400);
      expect((await book(customer, { description: 'leak' })).statusCode).toBe(400);
      expect((await book(customer, { addressId: other.addressId })).statusCode).toBe(404);
    });

    test('valid booking snapshots the address, prices and notifies staff', async () => {
      const res = await book(customer, { status: 'COMPLETED', quotedPriceUgx: 1 });
      expect(res.statusCode).toBe(201);
      const r = res.body.data.request;
      requestId = r.id;
      expect(r.requestNumber).toMatch(/^SR-\d{8}-\d{6}$/);
      expect(r.status).toBe('PENDING'); // client cannot set status
      expect(r.quotedPriceUgx).toBeNull(); // nor the price
      expect(r.priceFromUgx).toBe(20000);
      expect(r.address.district).toBe('Kampala');
      expect(r.contactPhone).toBe('+256772000111');
      expect(r.distanceKm).toBeGreaterThan(0);

      const n = await prisma.adminNotification.findFirst({ where: { type: 'NEW_SERVICE_REQUEST', linkUrl: `/service-requests/${r.id}` } });
      expect(n).not.toBeNull();
      expect(n.message).toMatch(/Ntinda, Kampala/);
    });

    test('customers only see their own bookings', async () => {
      const mine = await request(app).get('/api/service-requests').set('Authorization', `Bearer ${customer.token}`);
      expect(mine.body.data.requests.some((r) => r.id === requestId)).toBe(true);
      const theirs = await request(app).get(`/api/service-requests/${requestId}`).set('Authorization', `Bearer ${other.token}`);
      expect(theirs.statusCode).toBe(404);
    });
  });

  describe('staff lifecycle', () => {
    const patch = (body, token = dispatcherToken) =>
      request(app).patch(`/api/admin/services/requests/${requestId}`).set('Authorization', `Bearer ${token}`).send(body);

    test('cannot jump straight to IN_PROGRESS or COMPLETED', async () => {
      expect((await patch({ status: 'COMPLETED' })).statusCode).toBe(409);
      expect((await patch({ status: 'IN_PROGRESS' })).statusCode).toBe(409);
    });

    test('confirm with quote, assign technician, start, complete, record payment', async () => {
      const confirm = await patch({ status: 'CONFIRMED', quotedPriceUgx: 45000, note: 'Quoted after phone call' });
      expect(confirm.statusCode).toBe(200);
      expect(confirm.body.data.request.quotedPriceUgx).toBe(45000);

      const assign = await patch({ providerId: provider.id });
      expect(assign.body.data.request.status).toBe('ASSIGNED');
      expect(assign.body.data.request.provider.fullName).toBe('Okello James');

      // customer now sees who is coming
      const seen = await request(app).get(`/api/service-requests/${requestId}`).set('Authorization', `Bearer ${customer.token}`);
      expect(seen.body.data.request.provider).toEqual({ fullName: 'Okello James', phone: '+256701222333' });

      expect((await patch({ status: 'IN_PROGRESS' })).body.data.request.status).toBe('IN_PROGRESS');
      const done = await patch({ status: 'COMPLETED' });
      expect(done.body.data.request.status).toBe('COMPLETED');
      expect(done.body.data.request.completedAt).not.toBeNull();

      const cancelLate = await request(app).post(`/api/service-requests/${requestId}/cancel`).set('Authorization', `Bearer ${customer.token}`).send({});
      expect(cancelLate.statusCode).toBe(409);

      const badPay = await request(app).post(`/api/admin/services/requests/${requestId}/payment`).set('Authorization', `Bearer ${dispatcherToken}`).send({ method: 'VISA', reference: 'X1234' });
      expect(badPay.statusCode).toBe(400);
      const pay = await request(app)
        .post(`/api/admin/services/requests/${requestId}/payment`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ method: 'MTN_MOMO', reference: 'MP240101.1234.A12345' });
      expect(pay.statusCode).toBe(200);
      expect(pay.body.data.request.paymentStatus).toBe('PAID');
      const again = await request(app)
        .post(`/api/admin/services/requests/${requestId}/payment`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ method: 'MTN_MOMO', reference: 'MP240101.1234.A12345' });
      expect(again.statusCode).toBe(409);

      const detail = await request(app).get(`/api/admin/services/requests/${requestId}`).set('Authorization', `Bearer ${dispatcherToken}`);
      const statuses = detail.body.data.request.events.map((e) => e.to);
      expect(statuses).toEqual(expect.arrayContaining(['PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED']));

      const notes = await prisma.notification.findMany({ where: { userId: customer.id, type: 'SERVICE_UPDATE' } });
      expect(notes.map((n) => n.title)).toEqual(expect.arrayContaining(['Booking received', 'Booking confirmed', 'Technician assigned', 'Service completed', 'Payment received']));
    });

    test('customer can cancel a pending booking; staff are told', async () => {
      const created = (await book(customer)).body.data.request;
      const res = await request(app).post(`/api/service-requests/${created.id}/cancel`).set('Authorization', `Bearer ${customer.token}`).send({ reason: 'Fixed it myself' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.request.status).toBe('CANCELLED');
      const n = await prisma.adminNotification.findFirst({ where: { type: 'SERVICE_REQUEST_CANCELLED', linkUrl: `/service-requests/${created.id}` } });
      expect(n).not.toBeNull();
    });

    test('staff list filters by status and returns counts; route endpoint works', async () => {
      const list = await request(app).get('/api/admin/services/requests?status=COMPLETED').set('Authorization', `Bearer ${dispatcherToken}`);
      expect(list.statusCode).toBe(200);
      expect(list.body.data.items.every((r) => r.status === 'COMPLETED')).toBe(true);
      expect(list.body.data.statusCounts.COMPLETED).toBeGreaterThan(0);

      const route = await request(app).get(`/api/admin/services/requests/${requestId}/route`).set('Authorization', `Bearer ${dispatcherToken}`);
      expect(route.statusCode).toBe(200);
      expect(route.body.data.route.distanceKm).toBeGreaterThan(0);
      expect(route.body.data.route.geometry.length).toBeGreaterThanOrEqual(2);
    });

    test('customers cannot reach staff service endpoints', async () => {
      expect((await request(app).get('/api/admin/services/requests').set('Authorization', `Bearer ${customer.token}`)).statusCode).toBe(401);
    });
  });
});
