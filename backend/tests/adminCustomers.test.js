/**
 * Admin Customers API — integration tests.
 *
 * Covers:
 *   GET /api/admin/customers           — list with pagination + search
 *   GET /api/admin/customers/:id       — detail with recent orders
 *
 * Security invariants verified:
 *   - passwordHash is NEVER returned in any response
 *   - DISPATCHER role is blocked (403)
 *   - Unauthenticated requests are rejected (401)
 *   - Non-existent customer returns 404
 */

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const bcrypt = require('bcryptjs');
const { signAdminToken } = require('../src/services/token.service');

describe('Admin Customers API', () => {
  let superAdminToken = null;
  let dispatcherToken = null;
  let testUserId = null;
  let testUser2Id = null;
  let dispatcherAdminId = null;

  beforeAll(async () => {
    // Admin login
    const adminRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    superAdminToken = adminRes.body.data.token;

    // Dispatcher admin (blocked from customers endpoint)
    const dispatcher = await prisma.admin.upsert({
      where: { email: 'dispatcher.customers@ugandafood.market' },
      update: { role: 'DISPATCHER', isActive: true },
      create: {
        fullName: 'Test Dispatcher Customers',
        email: 'dispatcher.customers@ugandafood.market',
        passwordHash: '$2a$12$eXampleHashedPasswordForTestOnly999999999999999999999999',
        role: 'DISPATCHER',
        isActive: true,
      },
    });
    dispatcherAdminId = dispatcher.id;
    dispatcherToken = signAdminToken(dispatcher);

    // Test customers
    const hash = await bcrypt.hash('TestPass123!', 12);

    const user1 = await prisma.user.upsert({
      where: { phone: '+256700100001' },
      update: { fullName: 'Alice Namukasa', email: 'alice.namukasa@test.ug', isActive: true },
      create: {
        fullName: 'Alice Namukasa',
        phone: '+256700100001',
        email: 'alice.namukasa@test.ug',
        passwordHash: hash,
        isActive: true,
      },
    });
    testUserId = user1.id;

    const user2 = await prisma.user.upsert({
      where: { phone: '+256700100002' },
      update: { fullName: 'Bob Ochieng', email: null, isActive: true },
      create: {
        fullName: 'Bob Ochieng',
        phone: '+256700100002',
        passwordHash: hash,
        isActive: true,
      },
    });
    testUser2Id = user2.id;
  });

  afterAll(async () => {
    if (testUserId) await prisma.user.deleteMany({ where: { id: testUserId } });
    if (testUser2Id) await prisma.user.deleteMany({ where: { id: testUser2Id } });
    if (dispatcherAdminId) await prisma.admin.deleteMany({ where: { id: dispatcherAdminId } });
  });

  // ── Authentication & RBAC ──────────────────────────────────────────────────

  test('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/admin/customers');
    expect(res.statusCode).toBe(401);
  });

  test('blocks DISPATCHER from listing customers (403)', async () => {
    const res = await request(app)
      .get('/api/admin/customers')
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.statusCode).toBe(403);
  });

  test('blocks DISPATCHER from getting a customer by ID (403)', async () => {
    const res = await request(app)
      .get(`/api/admin/customers/${testUserId}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.statusCode).toBe(403);
  });

  // ── List customers ─────────────────────────────────────────────────────────

  test('GET /api/admin/customers returns paginated list', async () => {
    const res = await request(app)
      .get('/api/admin/customers?page=1&limit=50')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 50,
      total: expect.any(Number),
      totalPages: expect.any(Number),
    });

    // At minimum our two test users are present
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);

    // passwordHash must never appear
    for (const item of res.body.items) {
      expect(item.passwordHash).toBeUndefined();
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('fullName');
      expect(item).toHaveProperty('phone');
      expect(item).toHaveProperty('isActive');
      expect(item).toHaveProperty('createdAt');
      expect(item).toHaveProperty('orderCount');
    }
  });

  test('list includes the two test users created in beforeAll', async () => {
    const res = await request(app)
      .get('/api/admin/customers?page=1&limit=100')
      .set('Authorization', `Bearer ${superAdminToken}`);

    const ids = res.body.items.map((c) => c.id);
    expect(ids).toContain(testUserId);
    expect(ids).toContain(testUser2Id);
  });

  test('search by name filters the result set', async () => {
    const res = await request(app)
      .get('/api/admin/customers?search=Alice+Namukasa')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.items.some((c) => c.id === testUserId)).toBe(true);
    // Bob should not appear when searching for Alice
    expect(res.body.items.every((c) => c.id !== testUser2Id || c.fullName.includes('Alice'))).toBe(true);
  });

  test('search by phone returns the matching customer', async () => {
    const res = await request(app)
      .get('/api/admin/customers?search=256700100001')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.items.some((c) => c.id === testUserId)).toBe(true);
  });

  test('search by email returns the matching customer', async () => {
    const res = await request(app)
      .get('/api/admin/customers?search=alice.namukasa@test.ug')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.items.some((c) => c.id === testUserId)).toBe(true);
  });

  test('search that matches nothing returns empty items with total 0', async () => {
    const res = await request(app)
      .get('/api/admin/customers?search=nobody.at.all.xyz.zyx')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  test('rejects invalid UUID for page param — returns 400', async () => {
    const res = await request(app)
      .get('/api/admin/customers?page=abc')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ── Customer detail ────────────────────────────────────────────────────────

  test('GET /api/admin/customers/:id returns customer + order list', async () => {
    const res = await request(app)
      .get(`/api/admin/customers/${testUserId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customer).toMatchObject({
      id: testUserId,
      fullName: 'Alice Namukasa',
      email: 'alice.namukasa@test.ug',
      phone: '+256700100001',
    });
    expect(res.body.data.customer.passwordHash).toBeUndefined();
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      total: expect.any(Number),
    });
  });

  test('customer detail for user with null email returns email: null', async () => {
    const res = await request(app)
      .get(`/api/admin/customers/${testUser2Id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.customer.email).toBeNull();
  });

  test('returns 404 for a non-existent customer UUID', async () => {
    const res = await request(app)
      .get('/api/admin/customers/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 for a malformed (non-UUID) customer ID', async () => {
    const res = await request(app)
      .get('/api/admin/customers/not-a-uuid')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
