/**
 * FLUTTERWAVE PAYMENT PROVIDER (Phase 12 Step 2)
 *
 * Real provider adapter behind the existing payment-provider abstraction
 * (see index.js for the provider contract). Flutterwave-specific knowledge
 * (endpoints, payload shapes, status strings, verif-hash webhook scheme) is
 * deliberately confined to THIS file — the payment service, controllers and
 * routes stay provider-agnostic.
 *
 * Scope (Phase 12 Step 2): Uganda mobile money first slice.
 *   - MTN_MOBILE_MONEY  → network "MTN"
 *   - AIRTEL_MONEY      → network "AIRTEL"
 *   Networks are taken EXPLICITLY from the caller; phone-prefix inference is
 *   deliberately NOT used (number portability makes prefixes unreliable).
 *   CARD is intentionally NOT implemented: the full hosted-checkpoint /
 *   redirect-return flow is deferred (see "CARD" note in initiatePayment).
 *
 * API (v3, verified against developer.flutterwave.com and the official
 * flutterwave-node-v3 SDK sources):
 *   POST https://api.flutterwave.com/v3/charges?type=mobile_money_uganda
 *        body: { tx_ref, amount, currency, email, phone_number, network,
 *                fullname?, redirect_url? }
 *        → { status, message, meta: { authorization: { redirect, mode } } }
 *        (no data.id / flw_ref at initiation for this flow — the provider
 *        reference is established later, during webhook/verification)
 *   GET  https://api.flutterwave.com/v3/transactions/{id}/verify
 *   GET  https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=…
 *        → { status, data: { id, tx_ref, flw_ref, amount, currency, status,
 *            processor_response, created_at, … } }
 *   Webhook: merchant-configured secret hash returned in the `verif-hash`
 *   header, compared timing-safe against PAYMENT_WEBHOOK_SECRET. The hash is
 *   a shared-secret header comparison — it is NOT an HMAC recomputed from the
 *   payload.
 *
 * tx_ref ↔ UgaMarket reference mapping (deterministic):
 *   - Payment.transactionRef (e.g. "PAY-<uuid>", unique) is sent as the
 *     Flutterwave `tx_ref` on every charge.
 *   - Payment.providerRef stores Flutterwave's own reference (`flw_ref` /
 *     numeric `data.id` as string), persisted by payment.service via the
 *     normalized `providerRef` result field. `@@unique([provider,
 *     providerRef])` is preserved: providerRef stays null while unknown.
 *   - If providerRef is unknown (null), correlate by tx_ref: verification
 *     uses verify_by_reference?tx_ref=<transactionRef>; webhook events carry
 *     data.tx_ref and are resolved through Payment.transactionRef — the
 *     service then establishes providerRef from the event/verification.
 *
 * Server-authoritative rule: this adapter NEVER decides payment success. It
 * maps provider data into the normalized contract; payment.service.js keeps
 * verifying amounts, currency, tx_ref and state transitions against the DB.
 */

const crypto = require('crypto');
const env = require('../../config/env');

const FLW_API_BASE = 'https://api.flutterwave.com';
const REQUEST_TIMEOUT_MS = 15000;

// UgaMarket method → Flutterwave Uganda mobile-money network
const NETWORK_BY_METHOD = {
  MTN_MOBILE_MONEY: 'MTN',
  AIRTEL_MONEY: 'AIRTEL',
};

// Flutterwave transaction status → normalized outcome
const OUTCOME_BY_STATUS = {
  successful: 'SUCCESS',
  failed: 'FAILED',
  cancelled: 'FAILED', // customer abandoned the confirmation page
};

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

function assertConfigured() {
  if (!env.FLW_SECRET_KEY) {
    throw new Error(
      'Flutterwave provider is not configured: FLW_SECRET_KEY is missing (see backend/.env.example)'
    );
  }
}

function authHeaders() {
  return {
    Authorization: `Bearer ${env.FLW_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };
}

/** Timing-safe string comparison (length-mismatch short-circuit). */
function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Reconstruct raw-body-like string for webhook verification. */
function rawBodyToString(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8');
  if (typeof rawBody === 'string') return rawBody;
  return JSON.stringify(rawBody || {});
}

/**
 * Thin isolated HTTPS JSON client (kept here instead of adding the official
 * SDK dependency; keeps Flutterwave code inside this single file and the
 * dependency tree unchanged). TLS verification stays enabled (default).
 */
async function flwRequest(method, path, { body, query } = {}) {
  const url = new URL(`${FLW_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const error = new Error(`Flutterwave API error (HTTP ${response.status})`);
      error.isProviderError = true;
      error.httpStatus = response.status;
      error.providerMessage =
        parsed && typeof parsed === 'object' && parsed.message ? String(parsed.message).slice(0, 200) : null;
      throw error;
    }
    return parsed;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Flutterwave API request timed out');
      timeoutError.isProviderError = true;
      timeoutError.timeout = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Wrap provider/network failures into a normalized { ok:false, … } result. */
function toFailureResult(error) {
  if (error && error.isProviderError) {
    return {
      ok: false,
      outcome: 'FAILED',
      resultCode: error.timeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
      failureMessage: error.timeout ? 'Payment provider timed out' : 'Payment provider error',
      httpStatus: error.httpStatus || null,
    };
  }
  return {
    ok: false,
    outcome: 'FAILED',
    resultCode: 'PROVIDER_ERROR',
    failureMessage: 'Payment provider unavailable',
  };
}

/** Normalize a Flutterwave charge/transaction `data` object. */
function normalizeTransaction(tx) {
  const flwStatus = String(tx.status || '').toLowerCase();
  const outcome = OUTCOME_BY_STATUS[flwStatus] || 'FAILED';
  return {
    providerRef: tx.flw_ref ? String(tx.flw_ref) : tx.id !== undefined && tx.id !== null ? String(tx.id) : null,
    txRef: tx.tx_ref ? String(tx.tx_ref) : null,
    amountUgx: Number.isFinite(Number(tx.amount)) ? Math.trunc(Number(tx.amount)) : null,
    currency: tx.currency ? String(tx.currency).toUpperCase() : null,
    outcome,
    resultCode: outcome === 'SUCCESS' ? 'SUCCESS' : 'DECLINED',
    failureMessage: outcome === 'SUCCESS' ? null : String(tx.processor_response || 'Payment not successful').slice(0, 500),
    occurredAt: tx.created_at ? new Date(tx.created_at).toISOString() : new Date().toISOString(),
  };
}

/** Validate the parsed webhook body shape (post-signature). */
function parseWebhookEvent(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'MALFORMED_PAYLOAD' };
  }
  const data = parsed.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'MALFORMED_PAYLOAD' };
  }
  if (typeof parsed.event !== 'string' || parsed.event.length === 0) {
    return { ok: false, reason: 'MALFORMED_PAYLOAD' };
  }

  const normalized = normalizeTransaction(data);
  if (!normalized.providerRef || !normalized.txRef) {
    return { ok: false, reason: 'MALFORMED_PAYLOAD' };
  }
  if (!normalized.amountUgx || normalized.amountUgx <= 0) {
    return { ok: false, reason: 'MALFORMED_PAYLOAD' };
  }
  if (normalized.currency !== 'UGX') {
    return { ok: false, reason: 'MALFORMED_PAYLOAD' };
  }
  if (normalized.outcome !== 'SUCCESS' && normalized.outcome !== 'FAILED') {
    return { ok: false, reason: 'MALFORMED_PAYLOAD' };
  }

  return {
    ok: true,
    event: {
      providerRef: normalized.providerRef,
      orderNumber: normalized.txRef, // correlation key resolved by payment.service
      amountUgx: normalized.amountUgx,
      currency: normalized.currency,
      outcome: normalized.outcome,
      purpose: null,
      resultCode: normalized.resultCode,
      failureMessage: normalized.failureMessage,
      occurredAt: normalized.occurredAt,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Provider contract implementation
// ──────────────────────────────────────────────────────────────────────────

module.exports = {
  name: 'FLUTTERWAVE',
  isProduction: true, // real provider — allowed (and expected) in production

  /**
   * Create a provider-side charge attempt for Uganda mobile money.
   *
   * payment: {
   *   transactionRef, providerRef?, amountUgx, currency, purpose,
   *   method,        ← explicit MTN_MOBILE_MONEY | AIRTEL_MONEY (from request)
   *   customer: { fullName?, email?|null, phoneE164 }
   * }
   *
   * Returns one of:
   *   { ok:true, providerRef, checkoutUrl?, outcome, resultCode, raw }   (initiated)
   *   { ok:false, outcome:'FAILED', resultCode, failureMessage, httpStatus? } (provider refused/unreachable)
   *
   * CARD: accepted at the validation layer but NOT implemented here — the
   * hosted-checkout redirect-return flow is deferred to the next slice (the
   * method must not silently pretend card support is complete).
   */
  async initiatePayment({ payment } = {}) {
    assertConfigured();

    const network = NETWORK_BY_METHOD[payment.method];
    if (!network) {
      return {
        ok: false,
        outcome: 'FAILED',
        resultCode: 'INVALID_REFERENCE',
        failureMessage: `Unsupported payment method for Flutterwave mobile money: ${payment.method || '(none)'}`,
      };
    }

    if (!payment.customer || !payment.customer.phoneE164) {
      return {
        ok: false,
        outcome: 'FAILED',
        resultCode: 'INVALID_REFERENCE',
        failureMessage: 'Customer mobile number is required for mobile money',
      };
    }

    // Email is required by Flutterwave for mobile-money charges (§12). The
    // payment service resolves the EXISTING verified user email and fails
    // initiation with a business error when absent; this adapter-level guard
    // is the second line of defense — no address is ever invented here.
    if (!payment.customer.email) {
      return {
        ok: false,
        outcome: 'FAILED',
        resultCode: 'INVALID_REFERENCE',
        failureMessage: 'Customer email is required for mobile money payments',
      };
    }

    const chargeBody = {
      tx_ref: payment.transactionRef,
      amount: payment.amountUgx,
      currency: payment.currency || 'UGX',
      // Customer identity policy (documented §12): email is required by
      // Flutterwave. payment.service resolves an existing verified user email;
      // when the customer has none, initiation FAILS with a clear business
      // error instead of inventing a real-looking address.
      email: payment.customer.email,
      phone_number: payment.customer.phoneE164,
      network,
      ...(payment.customer.fullName ? { fullname: payment.customer.fullName } : {}),
    };

    try {
      const response = await flwRequest('POST', '/v3/charges', {
        query: { type: 'mobile_money_uganda' },
        body: chargeBody,
      });

      if (!response || response.status !== 'success') {
        return {
          ok: false,
          outcome: 'FAILED',
          resultCode: 'PROVIDER_ERROR',
          failureMessage: 'Payment provider rejected the charge request',
        };
      }

      const authorization = response.meta && response.meta.authorization;
      const checkoutUrl = authorization && authorization.redirect ? String(authorization.redirect) : null;

      // The UG momo charge response carries no data.id/flw_ref: providerRef is
      // established later from verification/webhook (nullable providerRef).
      return {
        ok: true,
        providerRef: null,
        checkoutUrl,
        outcome: 'PENDING',
        resultCode: 'NONE',
        raw: { status: response.status, message: response.message },
      };
    } catch (error) {
      return toFailureResult(error);
    }
  },

  /**
   * Verify a charge via Flutterwave's transaction verification endpoint.
   *
   * Resolves by providerRef (numeric transaction id) when known, otherwise by
   * tx_ref (verify_by_reference) — see module header mapping notes.
   * Returns { ok, providerRef?, outcome?, resultCode?, failureMessage?,
   *           txRef?, amountUgx?, currency?, httpStatus? } — the SERVICE owns
   * the authoritative amount/currency/tx_ref checks and state application.
   */
  async verifyPayment({ providerRef, transactionRef } = {}) {
    assertConfigured();

    if (!providerRef && !transactionRef) {
      return {
        ok: false,
        outcome: 'FAILED',
        resultCode: 'INVALID_REFERENCE',
        failureMessage: 'No provider or transaction reference available for verification',
      };
    }

    try {
      let response;
      if (providerRef) {
        response = await flwRequest('GET', `/v3/transactions/${encodeURIComponent(String(providerRef))}/verify`);
      } else {
        response = await flwRequest('GET', '/v3/transactions/verify_by_reference', {
          query: { tx_ref: transactionRef },
        });
      }

      if (!response || response.status !== 'success' || !response.data) {
        return {
          ok: false,
          outcome: 'FAILED',
          resultCode: 'INVALID_REFERENCE',
          failureMessage: 'Payment provider has no transaction data for this reference',
        };
      }

      const tx = normalizeTransaction(response.data);
      return {
        ok: true,
        providerRef: tx.providerRef,
        txRef: tx.txRef,
        outcome: tx.outcome,
        resultCode: tx.resultCode,
        failureMessage: tx.failureMessage,
        amountUgx: tx.amountUgx,
        currency: tx.currency,
        occurredAt: tx.occurredAt,
      };
    } catch (error) {
      return toFailureResult(error);
    }
  },

  /**
   * Validate webhook authenticity and normalize the provider event.
   * Flutterwave sends the merchant-configured secret hash in the `verif-hash`
   * header; it is compared timing-safe against PAYMENT_WEBHOOK_SECRET. This
   * is a shared-secret header check — NOT an HMAC over the payload.
   *
   * Returns { ok:true, event } | { ok:false, reason } and never throws, so
   * the caller can audit and respond generically.
   */
  verifyWebhook(options = {}) {
    const { rawBody, headers } = options || {};
    if (!rawBody || !headers) {
      return { ok: false, reason: 'MISSING_PAYLOAD' };
    }

    const received = headers['verif-hash'];
    const expected = env.PAYMENT_WEBHOOK_SECRET;
    if (!received || typeof received !== 'string') {
      return { ok: false, reason: 'MISSING_SIGNATURE' };
    }
    if (!expected || !timingSafeEqualStrings(expected, received)) {
      return { ok: false, reason: 'INVALID_SIGNATURE' };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawBodyToString(rawBody));
    } catch {
      return { ok: false, reason: 'MALFORMED_PAYLOAD' };
    }

    return parseWebhookEvent(parsed);
  },
};

