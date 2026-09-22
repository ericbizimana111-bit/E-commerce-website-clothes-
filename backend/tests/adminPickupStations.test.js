const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signAdminToken, signCustomerToken } = require('../src/services/token.service');

/**
 * Admin pickup-station management: RBAC, validation, duplicate protection,
 * audit logging, and that deactivation hides a station from the public list.
 */
describe('Admin Pickup Stations', () => {
  const tag = `PS-Test-${Date.now()}`;
  let adminToken;
  let dispatcherToken;
  let customerToken;
  let stationId;

  const valid = {
    name: `${tag} Hub`,
    district: 'Kampala',
    addressText: 'Test Street, Central Division',
    contactPhone: '+256700123456',
    operatingHours: 'Mon - Sat: 8:00 AM - 6:30 PM',
    pickupFeeUgx: 0,
  };

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    adminToken = res.body.data.token;

    const dispatcher = await prisma.admin.upsert({
      where: { email: 'dispatcher.stations@ugandafood.market' },
      update: { role: 'DISPATCHER', isActive: true },
      create: {
        fullName: 'Station Test Dispatcher',
        email: 'dispatcher.stations@ugandafood.market',
        passwordHash: '$2a$12$eXampleHashedPasswordForTestOnly999999999999999999999999',
        role: 'DISPATCHER',
        isActive: true,
      },
    });
    dispatcherToken = signAdminToken(dispatcher);
    customerToken = signCustomerToken({ id: '00000000-0000-0000-0000-000000000079', phone: '+256770000013' });
  });

  afterAll(async () => {
    await prisma.pickupStation.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.admin.deleteMany({ where: { email: 'dispatcher.stations@ugandafood.market' } });
    await prisma.$disconnect();
  });

  it('requires an admin token with the ADMIN or SUPER_ADMIN role', async () => {
    expect((await request(app).get('/api/admin/pickup-stations')).status).toBe(401);
    expect((await request(app).get('/api/admin/pickup-stations').set(auth(customerToken))).status).toBe(401);
    expect((await request(app).get('/api/admin/pickup-stations').set(auth(dispatcherToken))).status).toBe(403);
    expect((await request(app).post('/api/admin/pickup-stations').set(auth(dispatcherToken)).send(valid)).status).toBe(403);
  });

  it('creates a station and writes an audit record', async () => {
    const res = await request(app).post('/api/admin/pickup-stations').set(auth(adminToken)).send(valid);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: valid.name, isActive: true, pickupFeeUgx: 0, orderCount: 0 });
    stationId = res.body.data.id;

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PICKUP_STATION_CREATE', entityId: String(stationId) },
    });
    expect(audit).toBeTruthy();
  });

  it('rejects invalid input with field messages', async () => {
    const res = await request(app)
      .post('/api/admin/pickup-stations')
      .set(auth(adminToken))
      .send({ ...valid, name: 'x', contactPhone: 'call me', operatingHours: 'y'.repeat(200), pickupFeeUgx: -5 });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'contactPhone', 'operatingHours', 'pickupFeeUgx']));
  });

  it('refuses a duplicate name in the same district', async () => {
    const res = await request(app)
      .post('/api/admin/pickup-stations')
      .set(auth(adminToken))
      .send({ ...valid, name: valid.name.toUpperCase() });
    expect(res.status).toBe(409);
  });

  it('lists stations (including inactive) and supports search', async () => {
    const res = await request(app).get(`/api/admin/pickup-stations?search=${encodeURIComponent(tag)}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.items.map((s) => s.id)).toContain(stationId);
  });

  it('updates fields partially and 404s for unknown ids', async () => {
    const res = await request(app)
      .put(`/api/admin/pickup-stations/${stationId}`)
      .set(auth(adminToken))
      .send({ operatingHours: 'Mon - Sun: 7:00 AM - 9:00 PM', pickupFeeUgx: 1500 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ operatingHours: 'Mon - Sun: 7:00 AM - 9:00 PM', pickupFeeUgx: 1500, name: valid.name });

    expect((await request(app).put('/api/admin/pickup-stations/99999999').set(auth(adminToken)).send({ pickupFeeUgx: 1 })).status).toBe(404);
    expect((await request(app).put(`/api/admin/pickup-stations/${stationId}`).set(auth(adminToken)).send({})).status).toBe(400);
  });

  it('deactivating hides the station from the public list; reactivating restores it', async () => {
    const off = await request(app).patch(`/api/admin/pickup-stations/${stationId}/active`).set(auth(adminToken)).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data.isActive).toBe(false);

    const hidden = await request(app).get('/api/pickup-stations');
    expect(hidden.body.data.stations.map((s) => s.id)).not.toContain(stationId);

    await request(app).patch(`/api/admin/pickup-stations/${stationId}/active`).set(auth(adminToken)).send({ isActive: true });
    const shown = await request(app).get('/api/pickup-stations');
    expect(shown.body.data.stations.map((s) => s.id)).toContain(stationId);
  });
});
