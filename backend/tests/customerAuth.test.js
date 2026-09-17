const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');

describe('Customer Authentication & Authorization', () => {
  const testPhone = '+256774001122';
  const testPhoneLocal = '0774001122';
  const testEmail = 'customer.test@example.ug';
  const testPassword = 'StrongPassword123!';
  let testUserId = null;
  let customerToken = null;

  afterAll(async () => {
    // Clean up test user, their cart, and related data
    if (testUserId) {
      await prisma.cartItem.deleteMany({ where: { cart: { userId: testUserId } } });
      await prisma.cart.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
  });

  describe('Customer Registration', () => {
    test('rejects registration with missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    test('rejects registration with password shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test Customer',
          phone: testPhoneLocal,
          password: '123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      const passwordError = res.body.errors.find((e) => e.field === 'password');
      expect(passwordError).toBeDefined();
    });

    test('rejects registration with invalid phone format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test Customer',
          phone: 'not-a-phone',
          password: testPassword,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('rejects registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test Customer',
          phone: testPhoneLocal,
          email: 'invalid-email-format',
          password: testPassword,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('successfully registers a customer, hashes password, creates cart, and returns token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Mukasa Ronald',
          phone: testPhoneLocal,
          email: testEmail,
          password: testPassword,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.fullName).toBe('Mukasa Ronald');
      expect(res.body.data.user.phone).toBe(testPhone); // Normalized canonical format
      expect(res.body.data.user.email).toBe(testEmail);

      // CRITICAL: passwordHash must NEVER be returned
      expect(res.body.data.user.passwordHash).toBeUndefined();

      testUserId = res.body.data.user.id;
      customerToken = res.body.data.token;

      // Verify in DB directly: password is hashed, cart is created
      const dbUser = await prisma.user.findUnique({
        where: { id: testUserId },
        include: { cart: true },
      });

      expect(dbUser).toBeDefined();
      expect(dbUser.passwordHash).not.toBe(testPassword);
      expect(dbUser.passwordHash.startsWith('$2')).toBe(true);
      expect(await bcrypt.compare(testPassword, dbUser.passwordHash)).toBe(true);
      expect(dbUser.cart).toBeDefined(); // Cart auto-initialized
    });

    test('rejects duplicate registration with identical normalized phone in different format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Duplicate User',
          phone: '+256774001122', // International format of same phone
          password: testPassword,
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });

    test('rejects duplicate registration with same email address', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Duplicate Email User',
          phone: '0774999888',
          email: testEmail,
          password: testPassword,
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });
  });

  describe('Customer Login', () => {
    test('successfully logs in with valid credentials using local format phone', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          phone: testPhoneLocal,
          password: testPassword,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.phone).toBe(testPhone);
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    test('successfully logs in with valid credentials using international format phone', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          phone: testPhone,
          password: testPassword,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    test('rejects login with incorrect password with generic error message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          phone: testPhone,
          password: 'WrongPassword!',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid phone number or password');
    });

    test('rejects login with nonexistent phone with same generic error message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          phone: '0772000000',
          password: testPassword,
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid phone number or password');
    });

    test('rejects login if account is marked inactive', async () => {
      // Temporarily deactivate user
      await prisma.user.update({
        where: { id: testUserId },
        data: { isActive: false },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          phone: testPhone,
          password: testPassword,
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);

      // Reactivate user for subsequent tests
      await prisma.user.update({
        where: { id: testUserId },
        data: { isActive: true },
      });
    });
  });

  describe('Customer Auth Middleware (Protected Routes)', () => {
    test('allows access to GET /api/auth/me with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(testUserId);
      expect(res.body.data.user.fullName).toBe('Mukasa Ronald');
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    test('rejects request with missing Authorization header', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('token required');
    });

    test('rejects request with malformed Authorization header (no Bearer prefix)', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', customerToken);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects request with invalid token signature', async () => {
      const forgedToken = jwt.sign(
        { sub: testUserId, role: 'CUSTOMER', type: 'CUSTOMER_AUTH' },
        'wrong_tampered_secret_key_123'
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects request with expired token', async () => {
      const expiredToken = jwt.sign(
        { sub: testUserId, role: 'CUSTOMER', type: 'CUSTOMER_AUTH' },
        env.JWT_SECRET,
        { expiresIn: '-10s' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('expired');
    });

    test('rejects access if user has been deactivated after token issue', async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: { isActive: false },
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);

      // Reactivate
      await prisma.user.update({
        where: { id: testUserId },
        data: { isActive: true },
      });
    });
  });
});
