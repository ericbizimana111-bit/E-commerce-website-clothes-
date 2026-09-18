/**
 * ⚠️ DETERMINISTIC MOCK PAYMENT PROVIDER — NON-PRODUCTION ⚠️
 *
 * Exists ONLY for development and automated tests. It does NOT pretend a real
 * payment happened: it simulates the provider-side charge lifecycle
 * deterministically so the server-side verification machinery (signature
 * checks, amount/currency validation, idempotency, order transition) can be
 * exercised end-to-end without any external service.
 *
 * The payment service refuses to use this provider when NODE_ENV=production
 * (see payment.service.js), so production can never silently run on fake
 * payments.
 *
 * Outcome control (deterministic, test-oriented):
 *   - Default outcome for every attempt is SUCCESS.
 *   - initiatePayment/verifyPayment accept { mockOutcome } in their options.
 *   - Webhooks carry the outcome inside the provider payload AFTER signature
 *     verification (a real adapter would derive it from its own API payload —
 *     the adapter is the only component allowed to interpret provider data).
 *
 * Webhook signature: HMAC-SHA256 hex over the EXACT raw request body bytes,
 * keyed with PAYMENT_WEBHOOK_SECRET, sent as the x-ugafresh-signature header.
 */

const crypto = require('crypto');
const env = require('../../config/env');

const MOCK_OUTCOMES = {
  SUCCESS: { outcome: 'SUCCESS', resultCode: 'SUCCESS' },
  INSUFFICIENT_FUNDS: { outcome: 'FAILED', resultCode: 'INSUFFICIENT_FUNDS', failureMessage: 'Mock: insufficient funds' },
  TIMEOUT: { outcome: 'FAILED', resultCode: 'TIMEOUT', failureMessage: 'Mock: payment timed out' },
  DECLINED: { outcome: 'FAILED', resultCode: 'DECLINED', failureMessage: 'Mock: declined by issuer' },
  CANCELLED_BY_USER: { outcome: 'FAILED', resultCode: 'CANCELLED_BY_USER', failureMessage: 'Mock: cancelled by user' },
};

function resolveOutcome(mockOutcome) {
  return MOCK_OUTCOMES[mockOutcome] || MOCK_OUTCOMES.SUCCESS;
}

function signMockWebhook(rawBody) {
  return crypto.createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  name: 'MOCK',
  isProduction: false, // never allowed in production
  signMockWebhook, // exposed for tests/dev tooling ONLY — real adapters sign server-side

  /**
   * Create a provider-side charge attempt. The providerRef is derived from the
   * internal transactionRef so retries return the SAME reference (initiation
   * idempotency is ultimately enforced by payment.service + DB constraints).
   */
  initiatePayment({ payment, mockOutcome } = {}) {
    const outcome = resolveOutcome(mockOutcome);
    return {
      ok: true,
      providerRef: `MOCK-${payment.transactionRef}`,
      outcome: outcome.outcome,
      resultCode: outcome.resultCode,
      failureMessage: outcome.failureMessage || null,
      raw: { sandbox: true, note: 'mock provider — no real funds move' },
    };
  },

  /**
   * Poll the provider for the authoritative result of a charge.
   */
  verifyPayment({ providerRef, mockOutcome } = {}) {
    const outcome = resolveOutcome(mockOutcome);
    return {
      ok: true,
      providerRef: providerRef || null,
      outcome: outcome.outcome,
      resultCode: outcome.resultCode,
      failureMessage: outcome.failureMessage || null,
    };
  },

  /**
   * Validate webhook authenticity and normalize the provider event.
   * Returns { ok:true, event } or { ok:false, reason } — never throws for
   * rejected webhooks so the caller can audit and respond generically.
   *
   * Payload: { providerRef, orderNumber, amountUgx, currency, outcome }
   */
  verifyWebhook({ rawBody, headers } = {}) {
    if (!rawBody || !headers) {
      return { ok: false, reason: 'MISSING_PAYLOAD' };
    }
    const signature = headers['x-ugafresh-signature'];
    if (!signature) {
      return { ok: false, reason: 'MISSING_SIGNATURE' };
    }
    const expected = signMockWebhook(rawBody);
    if (!timingSafeEqualStrings(expected, signature)) {
      return { ok: false, reason: 'INVALID_SIGNATURE' };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { ok: false, reason: 'MALFORMED_PAYLOAD' };
    }

    const { providerRef, orderNumber, amountUgx, currency, outcome, purpose } = parsed;
    if (!providerRef || typeof providerRef !== 'string') {
      return { ok: false, reason: 'MALFORMED_PAYLOAD' };
    }
    if (!orderNumber || typeof orderNumber !== 'string') {
      return { ok: false, reason: 'MALFORMED_PAYLOAD' };
    }
    if (!Number.isInteger(amountUgx) || amountUgx <= 0) {
      return { ok: false, reason: 'MALFORMED_PAYLOAD' };
    }
    if (currency !== 'UGX') {
      return { ok: false, reason: 'MALFORMED_PAYLOAD' };
    }
    if (outcome !== 'SUCCESS' && outcome !== 'FAILED') {
      return { ok: false, reason: 'MALFORMED_PAYLOAD' };
    }
    if (purpose !== undefined && purpose !== 'COMMITMENT' && purpose !== 'BALANCE') {
      return { ok: false, reason: 'MALFORMED_PAYLOAD' };
    }

    return {
      ok: true,
      event: {
        providerRef,
        orderNumber,
        amountUgx,
        currency,
        outcome,
        purpose: purpose || null,
        resultCode: outcome === 'SUCCESS' ? 'SUCCESS' : 'DECLINED',
        failureMessage: outcome === 'SUCCESS' ? null : 'Mock webhook failure event',
        occurredAt: new Date().toISOString(),
      },
    };
  },
};
