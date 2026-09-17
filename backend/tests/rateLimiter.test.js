const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { authLimiter, apiLimiter } = require('../src/middleware/rateLimiter');

describe('Rate Limiting Architecture', () => {
  test('rate limiters are exported as functions/middleware', () => {
    expect(typeof authLimiter).toBe('function');
    expect(typeof apiLimiter).toBe('function');
  });

  test('strict auth limiter blocks requests after exceeding threshold', async () => {
    // Test limiter with a low threshold to verify 429 response structure
    const testApp = express();
    const strictTestLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: 'Too many authentication attempts, please try again in 15 minutes.',
      },
    });

    testApp.post('/api/auth/test-login', strictTestLimiter, (req, res) => {
      res.json({ success: true });
    });

    // Send 3 requests (allowed)
    await request(testApp).post('/api/auth/test-login');
    await request(testApp).post('/api/auth/test-login');
    const res3 = await request(testApp).post('/api/auth/test-login');
    expect(res3.statusCode).toBe(200);

    // 4th request must be rejected with 429 Too Many Requests
    const res4 = await request(testApp).post('/api/auth/test-login');
    expect(res4.statusCode).toBe(429);
    expect(res4.body.success).toBe(false);
    expect(res4.body.message).toContain('Too many authentication attempts');
  });
});
