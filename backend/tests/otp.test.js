const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/config/db');
const otpService = require('../src/services/otp.service');

describe('OTP Verification System', () => {
  const testPhone = '+256788990011';

  afterAll(async () => {
    // Clean up temporary OTP records created during test
    await prisma.otpCode.deleteMany({
      where: { phone: testPhone },
    });
  });

  describe('OTP Service Layer', () => {
    test('requestOtp generates and stores hashed OTP (never plaintext)', async () => {
      const result = await otpService.requestOtp(testPhone);

      expect(result.success).toBe(true);
      expect(result.expiresInSeconds).toBe(300);
      expect(result.devCode).toBeDefined();

      // Query database directly to verify stored record
      const record = await prisma.otpCode.findFirst({
        where: { phone: testPhone, consumed: false },
        orderBy: { createdAt: 'desc' },
      });

      expect(record).toBeDefined();
      // Must NOT be stored in plaintext
      expect(record.codeHash).not.toBe(result.devCode);
      expect(record.codeHash.startsWith('$2')).toBe(true); // bcrypt hash

      // Verify bcrypt comparison succeeds
      const isMatch = await bcrypt.compare(result.devCode, record.codeHash);
      expect(isMatch).toBe(true);
    });

    test('verifyOtp successfully validates correct code and marks it consumed', async () => {
      const { devCode } = await otpService.requestOtp(testPhone);

      const verification = await otpService.verifyOtp(testPhone, devCode);
      expect(verification.success).toBe(true);

      // Verify it is now marked consumed in database
      const consumedRecord = await prisma.otpCode.findFirst({
        where: { phone: testPhone, consumed: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(consumedRecord.consumed).toBe(true);
    });

    test('verifyOtp rejects wrong OTP code', async () => {
      await otpService.requestOtp(testPhone);

      await expect(otpService.verifyOtp(testPhone, '000000')).rejects.toThrow(
        'Invalid verification code'
      );
    });

    test('verifyOtp rejects already consumed OTP (prevents replay)', async () => {
      const { devCode } = await otpService.requestOtp(testPhone);

      // First verification succeeds
      await otpService.verifyOtp(testPhone, devCode);

      // Second attempt with same code fails
      await expect(otpService.verifyOtp(testPhone, devCode)).rejects.toThrow(
        'Invalid or expired verification code'
      );
    });

    test('verifyOtp rejects expired OTP', async () => {
      // Create manually expired OTP
      const salt = await bcrypt.genSalt(10);
      const codeHash = await bcrypt.hash('123456', salt);

      await prisma.otpCode.create({
        data: {
          phone: testPhone,
          codeHash,
          expiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
          consumed: false,
        },
      });

      await expect(otpService.verifyOtp(testPhone, '123456')).rejects.toThrow(
        'Invalid or expired verification code'
      );
    });
  });

  describe('OTP REST Endpoints', () => {
    test('POST /api/auth/otp/request validates phone and returns success', async () => {
      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ phone: '0788990011' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Verification code sent');
    });

    test('POST /api/auth/otp/request rejects invalid phone format', async () => {
      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ phone: '12345' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('POST /api/auth/otp/verify validates valid code via HTTP', async () => {
      const reqRes = await request(app)
        .post('/api/auth/otp/request')
        .send({ phone: '0788990011' });

      const code = reqRes.body.devCode;

      const verifyRes = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: '0788990011', code });

      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.message).toContain('verified');
    });
  });
});
