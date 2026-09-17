const express = require('express');
const rateLimit = require('express-rate-limit');

const paymentController = require('../controllers/payment.controller');

const router = express.Router();

// Webhook limiter: generous for legitimate provider retries, still a cap.
// (The general API limiter already applies globally; this adds targeted headroom.)
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Webhook rate limit exceeded, please retry later.' },
});

// ── Provider webhook (public, signature-verified) ──
// Raw body bytes are captured globally by express.json's `verify` hook in
// app.js, so HMAC verification sees exactly what the provider sent.
// Deliberately NO customer/admin JWT: providers authenticate via signature.
router.post('/webhook', webhookLimiter, paymentController.paymentWebhook);

// Customer payment initiation/lookup intentionally lives on the ORDERS router
// (`/api/orders/:id/payment`) so it inherits customer authentication exactly
// like every other order operation — see routes/order.routes.js.

module.exports = router;
