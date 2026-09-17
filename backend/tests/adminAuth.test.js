const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signCustomerToken, signAdminToken } = require('../src/services/token.service');

describe('Admin Authentication & RBAC Authorization', () => {
  let superAdminToken = null;
  let adminToken = null;

  describe('Admin Login', () => {
    test('successfully logs in SUPER_ADMIN with valid credentials', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: env.ADMIN_1_EMAIL,
          password: env.ADMIN_1_PASSWORD,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.admin).toBeDefined();
      expect(res.body.data.admin.email).toBe(env.ADMIN_1_EMAIL);
      expect(res.body.data.admin.role).toBe('SUPER_ADMIN');
      // CRITICAL: passwordHash must NEVER be returned
      expect(res.body.data.admin.passwordHash).toBeUndefined();

      superAdminToken = res.body.data.token;
    });

    test('successfully logs in regular ADMIN with valid credentials', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: env.ADMIN_2_EMAIL,
          password: env.ADMIN_2_PASSWORD,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.admin.role).toBe('ADMIN');
      expect(res.body.data.admin.passwordHash).toBeUndefined();

      adminToken = res.body.data.token;
    });

    test('rejects login with wrong password using generic error message', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: env.ADMIN_1_EMAIL,
          password: 'IncorrectPassword!',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    test('rejects login with nonexistent admin email using same generic error message', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'nonexistent.admin@ugandafood.market',
          password: 'SomePassword123!',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    test('rejects admin login with invalid email syntax', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'not-an-email',
          password: env.ADMIN_1_PASSWORD,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Admin Auth Middleware & Context Partitioning', () => {
    test('allows access to GET /api/admin/auth/me with valid admin token', async () => {
      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.admin.email).toBe(env.ADMIN_1_EMAIL);
      expect(res.body.data.admin.passwordHash).toBeUndefined();
    });

    test('rejects admin endpoint when customer token is provided (Context Isolation)', async () => {
      // Forge or create a valid customer token
      const fakeCustomerToken = signCustomerToken({
        id: '00000000-0000-0000-0000-000000000001',
        phone: '+256772000000',
      });

      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${fakeCustomerToken}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects customer endpoint when admin token is provided (Context Isolation)', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects admin request with missing token', async () => {
      const res = await request(app).get('/api/admin/auth/me');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects admin request with expired admin token', async () => {
      const expiredToken = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000002', role: 'ADMIN', type: 'ADMIN_AUTH' },
        env.ADMIN_JWT_SECRET,
        { expiresIn: '-10s' }
      );

      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('expired');
    });
  });

  describe('Role-Based Access Control (RBAC)', () => {
    test('allows SUPER_ADMIN to access super-admin-only route', async () => {
      const res = await request(app)
        .get('/api/admin/auth/super-admin-only')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Welcome Super Admin');
    });

    test('rejects regular ADMIN from accessing super-admin-only route (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/admin/auth/super-admin-only')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Forbidden');
    });

    test('allows both SUPER_ADMIN and ADMIN to access dispatcher-or-admin route', async () => {
      const resSuper = await request(app)
        .get('/api/admin/auth/dispatcher-or-admin')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(resSuper.statusCode).toBe(200);
      expect(resSuper.body.success).toBe(true);

      const resAdmin = await request(app)
        .get('/api/admin/auth/dispatcher-or-admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resAdmin.statusCode).toBe(200);
      expect(resAdmin.body.success).toBe(true);
    });

    test('allows DISPATCHER to access dispatcher-or-admin route and rejects on super-admin route', async () => {
      // Create ephemeral dispatcher admin for testing
      const dispatcher = await prisma.admin.upsert({
        where: { email: 'dispatcher.test@ugandafood.market' },
        update: { role: 'DISPATCHER', isActive: true },
        create: {
          fullName: 'Test Dispatcher',
          email: 'dispatcher.test@ugandafood.market',
          passwordHash: '$2a$12$eXampleHashedPasswordForTestOnly999999999999999999999999',
          role: 'DISPATCHER',
          isActive: true,
        },
      });

      const dispatcherToken = signAdminToken(dispatcher);

      // Allowed on dispatcher-or-admin
      const resAllowed = await request(app)
        .get('/api/admin/auth/dispatcher-or-admin')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(resAllowed.statusCode).toBe(200);

      // Rejected on super-admin-only (403)
      const resDenied = await request(app)
        .get('/api/admin/auth/super-admin-only')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(resDenied.statusCode).toBe(403);

      // Clean up test dispatcher
      await prisma.admin.delete({ where: { id: dispatcher.id } });
    });

    test('rejects unauthenticated requests to protected role route with 401', async () => {
      const res = await request(app).get('/api/admin/auth/super-admin-only');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
