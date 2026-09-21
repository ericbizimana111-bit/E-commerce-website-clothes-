const express = require('express');
const rateLimit = require('express-rate-limit');

const paymentController = require('../controllers/payment.controller');
const paymentReturnController = require('../controllers/paymentReturn.controller');

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

// ── Card payment return URL ──
// Flutterwave redirects the customer's browser here after hosted-checkout.
// No JWT: reached via browser redirect from Flutterwave's page, not an API
// call. The handler looks up the order from tx_ref and redirects the customer
// to their order page. The webhook is the canonical payment-result channel.
router.get('/return', paymentReturnController.handleReturn);

// Customer payment initiation/lookup intentionally lives on the ORDERS router
// (`/api/orders/:id/payment`) so it inherits customer authentication exactly
// like every other order operation — see routes/order.routes.js.

module.exports = router;
