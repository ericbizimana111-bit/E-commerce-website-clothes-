/**
 * Phase 12 Step 2 — Flutterwave provider adapter unit tests.
 *
 * PURE unit tests: the adapter never touches the network in tests. All HTTP
 * traffic is intercepted by stubbing global fetch; secrets come from test
 * env defaults (no real Flutterwave credentials exist here — see §14).
 *
 * Uses the two-tier reset pattern from configValidation.test.js:
 *   - beforeEach jest.resetModules + fresh require cache per test, OR
 *   - a module-level provider instance shared by most tests with targeted
 *     jest.isolateModules for env-dependent branches.
 */

// Dummy TEST-MODE credentials so config/env validates and the adapter's
// configuration guard passes. These are NOT real Flutterwave credentials,
// never hit the real API (all HTTP is stubbed below), and are restored
// immediately after this suite's imports complete.
const PREVIOUS_FLW_ENV = {
  FLW_PUBLIC_KEY: process.env.FLW_PUBLIC_KEY,
  FLW_SECRET_KEY: process.env.FLW_SECRET_KEY,
  FLW_RETURN_URL: process.env.FLW_RETURN_URL,
};
process.env.FLW_PUBLIC_KEY = process.env.FLW_PUBLIC_KEY || 'FLWPUBK_TEST-dummy-public-key';
process.env.FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || 'FLWSECK_TEST-dummy-secret-key';
process.env.FLW_RETURN_URL = process.env.FLW_RETURN_URL || 'http://localhost:4000/api/payments/return';

const env = require('../src/config/env');

// Deterministic test secret — NOT a real credential (test-only, never valid
// against the real Flutterwave API).
const TEST_WEBHOOK_SECRET = env.PAYMENT_WEBHOOK_SECRET;

afterAll(() => {
  for (const [key, value] of Object.entries(PREVIOUS_FLW_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// A minimal success response for POST /v3/payments (card hosted checkout).
function cardPaymentLinkResponse(overrides = {}) {
  return {
    status: 'success',
    message: 'Hosted Link',
    data: { link: 'https://checkout.flutterwave.com/v3/hosted/pay/testlink123' },
    ...overrides,
  };
}

// A minimal valid UG mobile-money initiation response (per Flutterwave docs:
// no data.id / flw_ref — only meta.authorization.redirect).
function chargeResponse(overrides = {}) {
  return {
    status: 'success',
    message: 'Charge initiated',
    meta: {
      authorization: {
        redirect: 'https://checkout.example/confirm/144:abc123',
        mode: 'redirect',
      },
    },
    ...overrides,
  };
}

// Minimal verify-transaction response body (shape per Flutterwave docs).
function verifyResponse(overrides = {}) {
  return {
    status: 'success',
    message: 'Transaction fetched successfully',
    data: {
      id: 2073992,
      tx_ref: 'PAY-test-0001',
      flw_ref: 'FLW-M03K-abc123',
      amount: 1500,
      currency: 'UGX',
      status: 'successful',
      processor_response: 'Approved',
      created_at: '2026-05-07T09:48:13.000Z',
    },
    ...overrides,
  };
}

// Minimal charge.completed webhook payload (shape per Flutterwave docs).
function webhookPayload(overrides = {}) {
  return {
    event: 'charge.completed',
    data: {
      id: 2073992,
      tx_ref: 'PAY-test-0001',
      flw_ref: 'FLW-M03K-abc123',
      amount: 1500,
      currency: 'UGX',
      status: 'successful',
      processor_response: 'Approved',
      created_at: '2026-05-07T09:48:13.000Z',
    },
    ...overrides,
  };
}

function basePayment(overrides = {}) {
  return {
    transactionRef: 'PAY-test-0001',
    providerRef: null,
    amountUgx: 1500,
    currency: 'UGX',
    purpose: 'COMMITMENT',
    method: 'MTN_MOBILE_MONEY',
    customer: { fullName: 'Test Customer', email: 'customer@example.com', phoneE164: '+256700000001' },
    ...overrides,
  };
}

function mockFetchSequence(handler) {
  const calls = [];
  global.fetch = jest.fn(async (url, options) => {
    calls.push({ url: String(url), options });
    return handler({ url: String(url), options });
  });
  return calls;
}

describe('Phase 12 Step 2 — Flutterwave provider adapter', () => {
  let provider;

  beforeAll(() => {
    jest.isolateModules(() => {
      provider = require('../src/services/paymentProviders/flutterwaveProvider');
    });
  });

  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  // ── Initiation ──────────────────────────────────────────────────────────

  describe('initiatePayment — MTN & Airtel mapping', () => {
    test('successful MTN initiation maps tx_ref/amount/currency/network and returns checkoutUrl', async () => {
      const calls = mockFetchSequence(() =>
        Promise.resolve(new Response(JSON.stringify(chargeResponse()), { status: 200 }))
      );

      const result = await provider.initiatePayment({ payment: basePayment() });

      expect(result.ok).toBe(true);
      expect(result.checkoutUrl).toBe('https://checkout.example/confirm/144:abc123');
      expect(result.providerRef).toBeNull(); // UG momo: established at webhook/verify
      expect(calls).toHaveLength(1);
      const { url, options } = calls[0];
      expect(url).toBe('https://api.flutterwave.com/v3/charges?type=mobile_money_uganda');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.tx_ref).toBe('PAY-test-0001'); // §5/§9: UgaMarket transactionRef IS the tx_ref
      expect(body.amount).toBe(1500);
      expect(body.currency).toBe('UGX');
      expect(body.network).toBe('MTN');
      expect(body.phone_number).toBe('+256700000001');
      expect(body.email).toBe('customer@example.com');
    });

    test('Airtel initiation maps method AIRTEL_MONEY → network AIRTEL', async () => {
      const calls = mockFetchSequence(() =>
        Promise.resolve(new Response(JSON.stringify(chargeResponse()), { status: 200 }))
      );

      const result = await provider.initiatePayment({ payment: basePayment({ method: 'AIRTEL_MONEY' }) });

      expect(result.ok).toBe(true);
      const body = JSON.parse(calls[0].options.body);
      expect(body.network).toBe('AIRTEL');
    });

    test('does not infer network from phone prefix; requires explicit method', async () => {
      mockFetchSequence(() => Promise.resolve(new Response(JSON.stringify(chargeResponse()), { status: 200 })));

      const result = await provider.initiatePayment({ payment: basePayment({ method: undefined }) });
      expect(result.ok).toBe(false);
      expect(result.resultCode).toBe('INVALID_REFERENCE');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('no customer email → initiation fails with a clear business error (§12)', async () => {
      mockFetchSequence(() => Promise.resolve(new Response(JSON.stringify(chargeResponse()), { status: 200 })));

      const result = await provider.initiatePayment({
        payment: basePayment({ customer: { fullName: 'X', email: null, phoneE164: '+256700000001' } }),
      });
      expect(result.ok).toBe(false);
      expect(result.failureMessage).toMatch(/email/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('missing phone → initiation fails before any network call', async () => {
      mockFetchSequence(() => Promise.resolve(new Response('{}', { status: 200 })));

      const result = await provider.initiatePayment({
        payment: basePayment({ customer: { fullName: 'X', email: 'a@b.co', phoneE164: null } }),
      });
      expect(result.ok).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ── Verification ────────────────────────────────────────────────────────

  describe('verifyPayment', () => {
    test('verifies by providerRef through /transactions/{id}/verify and normalizes success', async () => {
      const calls = mockFetchSequence(() =>
        Promise.resolve(new Response(JSON.stringify(verifyResponse()), { status: 200 }))
      );

      const result = await provider.verifyPayment({ providerRef: '2073992' });

      expect(result.ok).toBe(true);
      expect(result.outcome).toBe('SUCCESS');
      expect(result.providerRef).toBe('FLW-M03K-abc123'); // flw_ref preferred as providerRef
      expect(result.txRef).toBe('PAY-test-0001');
      expect(result.amountUgx).toBe(1500);
      expect(result.currency).toBe('UGX');
      expect(calls[0].url).toBe('https://api.flutterwave.com/v3/transactions/2073992/verify');
    });

    test('no providerRef → verify_by_reference?tx_ref= fallback (§9)', async () => {
      const calls = mockFetchSequence(() =>
        Promise.resolve(new Response(JSON.stringify(verifyResponse()), { status: 200 }))
      );

      const result = await provider.verifyPayment({ transactionRef: 'PAY-test-0001' });

      expect(result.ok).toBe(true);
      expect(calls[0].url).toBe(
        'https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=PAY-test-0001'
      );
    });

    test('failed transaction normalizes to FAILED with provider message', async () => {
      mockFetchSequence(() =>
        Promise.resolve(
          new Response(
            JSON.stringify(verifyResponse({ data: { status: 'failed', processor_response: 'Insufficient funds' } })),
            { status: 200 }
          )
        )
      );

      const result = await provider.verifyPayment({ providerRef: '2073992' });
      expect(result.ok).toBe(true); // the QUERY succeeded
      expect(result.outcome).toBe('FAILED');
      expect(result.resultCode).toBe('DECLINED');
      expect(result.failureMessage).toContain('Insufficient funds');
    });

    test('unknown transaction (provider error body) → INVALID_REFERENCE', async () => {
      mockFetchSequence(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: 'error', message: 'No transaction was found for this id', data: null }), {
            status: 200,
          })
        )
      );

      const result = await provider.verifyPayment({ providerRef: '1' });
      expect(result.ok).toBe(false);
      expect(result.resultCode).toBe('INVALID_REFERENCE');
    });

    test('providerRef and transactionRef both missing → INVALID_REFERENCE, no network call', async () => {
      mockFetchSequence(() => Promise.resolve(new Response('{}', { status: 200 })));
      const result = await provider.verifyPayment({});
      expect(result.ok).toBe(false);
      expect(result.resultCode).toBe('INVALID_REFERENCE');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ── Webhook ─────────────────────────────────────────────────────────────

  describe('verifyWebhook', () => {
    const rawBody = Buffer.from(JSON.stringify(webhookPayload()));

    test('correct verif-hash secret → normalized SUCCESS event', () => {
      const res = provider.verifyWebhook({
        rawBody,
        headers: { 'verif-hash': TEST_WEBHOOK_SECRET },
      });
      expect(res.ok).toBe(true);
      expect(res.event.outcome).toBe('SUCCESS');
      expect(res.event.providerRef).toBe('FLW-M03K-abc123');
      expect(res.event.amountUgx).toBe(1500);
      expect(res.event.currency).toBe('UGX');
      expect(res.event.orderNumber).toBe('PAY-test-0001'); // tx_ref correlation key
    });

    test('invalid secret → INVALID_SIGNATURE', () => {
      const res = provider.verifyWebhook({
        rawBody,
        headers: { 'verif-hash': 'wrong-secret-value' },
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('INVALID_SIGNATURE');
    });

    test('missing verif-hash header → MISSING_SIGNATURE', () => {
      const res = provider.verifyWebhook({ rawBody, headers: {} });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('MISSING_SIGNATURE');
    });

    test('malformed JSON body → MALFORMED_PAYLOAD', () => {
      const res = provider.verifyWebhook({
        rawBody: Buffer.from('not json {'),
        headers: { 'verif-hash': TEST_WEBHOOK_SECRET },
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('MALFORMED_PAYLOAD');
    });

    test('payload missing data object → MALFORMED_PAYLOAD', () => {
      const res = provider.verifyWebhook({
        rawBody: Buffer.from(JSON.stringify({ event: 'charge.completed' })),
        headers: { 'verif-hash': TEST_WEBHOOK_SECRET },
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('MALFORMED_PAYLOAD');
    });

    test('non-UGX webhook payload → MALFORMED_PAYLOAD (adapter boundary)', () => {
      const payload = webhookPayload();
      payload.data.currency = 'KES';
      const res = provider.verifyWebhook({
        rawBody: Buffer.from(JSON.stringify(payload)),
        headers: { 'verif-hash': TEST_WEBHOOK_SECRET },
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('MALFORMED_PAYLOAD');
    });

    test('missing flw_ref AND id → MALFORMED_PAYLOAD', () => {
      const payload = webhookPayload();
      delete payload.data.flw_ref;
      delete payload.data.id;
      const res = provider.verifyWebhook({
        rawBody: Buffer.from(JSON.stringify(payload)),
        headers: { 'verif-hash': TEST_WEBHOOK_SECRET },
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('MALFORMED_PAYLOAD');
    });

    test('cancelled transaction → FAILED outcome normalization', () => {
      const payload = webhookPayload();
      payload.data.status = 'cancelled';
      const res = provider.verifyWebhook({
        rawBody: Buffer.from(JSON.stringify(payload)),
        headers: { 'verif-hash': TEST_WEBHOOK_SECRET },
      });
      expect(res.ok).toBe(true);
      expect(res.event.outcome).toBe('FAILED');
      expect(res.event.resultCode).toBe('DECLINED');
    });

    test('timing-safe comparison tolerates equal-length wrong secrets without throwing', () => {
      const sameLength = 'a'.repeat(TEST_WEBHOOK_SECRET.length);
      const res = provider.verifyWebhook({ rawBody, headers: { 'verif-hash': sameLength } });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('INVALID_SIGNATURE');
    });
  });

  // ── Failure modes & hygiene ─────────────────────────────────────────────

  describe('failure modes and security hygiene', () => {
    test('HTTP 500 from provider → normalized PROVIDER_ERROR (no throw)', async () => {
      mockFetchSequence(() => Promise.resolve(new Response(JSON.stringify({ message: 'boom' }), { status: 500 })));

      const result = await provider.initiatePayment({ payment: basePayment() });
      expect(result.ok).toBe(false);
      expect(result.resultCode).toBe('PROVIDER_ERROR');
      expect(result.httpStatus).toBe(500);
      expect(result.failureMessage).toBe('Payment provider error');
    });

    test('network timeout → TIMEOUT resultCode', async () => {
      mockFetchSequence(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await provider.initiatePayment({ payment: basePayment() });
      expect(result.ok).toBe(false);
      expect(result.resultCode).toBe('TIMEOUT');
    });

    test('DNS/connection failure → PROVIDER_ERROR (network failure branch)', async () => {
      mockFetchSequence(() => Promise.reject(new Error('getaddrinfo ENOTFOUND api.flutterwave.com')));

      const result = await provider.verifyPayment({ providerRef: '123' });
      expect(result.ok).toBe(false);
      expect(result.resultCode).toBe('PROVIDER_ERROR');
      expect(result.failureMessage).toBe('Payment provider unavailable');
    });

    test('no credentials leak into normalized results or error messages', async () => {
      mockFetchSequence(() => Promise.resolve(new Response(JSON.stringify({ message: 'denied' }), { status: 401 })));

      const results = [
        await provider.initiatePayment({ payment: basePayment() }),
        await provider.verifyPayment({ providerRef: '123' }),
      ];
      for (const result of results) {
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain(env.FLW_SECRET_KEY || '__no_secret__');
        expect(serialized).not.toContain('Bearer');
        expect(serialized).not.toContain('Authorization');
      }
    });

    test('Authorization header is sent exactly once per request with Bearer scheme', async () => {
      const calls = mockFetchSequence(() =>
        Promise.resolve(new Response(JSON.stringify(verifyResponse()), { status: 200 }))
      );
      await provider.verifyPayment({ providerRef: '2073992' });
      const headers = calls[0].options.headers;
      expect(Object.keys(headers).filter((k) => k === 'Authorization')).toHaveLength(1);
      expect(headers.Authorization.startsWith('Bearer ')).toBe(true);
      expect(headers.Authorization).toContain(env.FLW_SECRET_KEY || '');
    });

    test('CARD uses POST /v3/payments (hosted checkout) and returns checkoutUrl from data.link', async () => {
      const calls = mockFetchSequence(() =>
        Promise.resolve(new Response(JSON.stringify(cardPaymentLinkResponse()), { status: 200 }))
      );

      const result = await provider.initiatePayment({ payment: basePayment({ method: 'CARD' }) });

      expect(result.ok).toBe(true);
      expect(result.checkoutUrl).toBe('https://checkout.flutterwave.com/v3/hosted/pay/testlink123');
      expect(result.providerRef).toBeNull(); // established later via webhook
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://api.flutterwave.com/v3/payments');
      expect(calls[0].options.method).toBe('POST');
      const body = JSON.parse(calls[0].options.body);
      expect(body.tx_ref).toBe('PAY-test-0001');
      expect(body.amount).toBe(1500);
      expect(body.currency).toBe('UGX');
      expect(body.redirect_url).toBe('http://localhost:4000/api/payments/return');
      expect(body.customer.email).toBe('customer@example.com');
    });

    test('CARD with missing email → INVALID_REFERENCE (no fetch call)', async () => {
      mockFetchSequence(() => Promise.resolve(new Response('{}', { status: 200 })));

      const result = await provider.initiatePayment({
        payment: basePayment({ method: 'CARD', customer: { fullName: 'X', email: null, phoneE164: '+256700000001' } }),
      });

      expect(result.ok).toBe(false);
      expect(result.resultCode).toBe('INVALID_REFERENCE');
      expect(result.failureMessage).toMatch(/email/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('CARD with unconfigured FLW_RETURN_URL → CONFIGURATION_ERROR (no fetch call)', async () => {
      let isolatedProvider;
      const saved = process.env.FLW_RETURN_URL;
      delete process.env.FLW_RETURN_URL;
      jest.isolateModules(() => {
        isolatedProvider = require('../src/services/paymentProviders/flutterwaveProvider');
      });
      if (saved !== undefined) process.env.FLW_RETURN_URL = saved;

      mockFetchSequence(() => Promise.resolve(new Response('{}', { status: 200 })));
      const result = await isolatedProvider.initiatePayment({ payment: basePayment({ method: 'CARD' }) });
      expect(result.ok).toBe(false);
      expect(result.resultCode).toBe('CONFIGURATION_ERROR');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('CARD provider returns no data.link → PROVIDER_ERROR', async () => {
      mockFetchSequence(() =>
        Promise.resolve(new Response(JSON.stringify({ status: 'success', data: {} }), { status: 200 }))
      );

      const result = await provider.initiatePayment({ payment: basePayment({ method: 'CARD' }) });
      expect(result.ok).toBe(false);
      expect(result.resultCode).toBe('PROVIDER_ERROR');
    });

    test('verifyWebhook never throws for adversarial inputs', () => {
      const adversarial = [undefined, null, {}, { rawBody: Buffer.from('{}') }, { headers: { 'verif-hash': 'x' } }];
      for (const input of adversarial) {
        expect(() => provider.verifyWebhook(input)).not.toThrow();
      }
    });
  });
});
