/**
 * Payment Provider Abstraction (Phase 6)
 *
 * A provider is a thin, stateless adapter: it talks to the outside payment
 * world and returns NORMALIZED results. It never touches the database and
 * never decides order lifecycle — that is payment.service's job.
 *
 * Every provider MUST implement:
 *   name                     – stable identifier, matches env PAYMENT_PROVIDER
 *   isProduction             – true only for providers allowed in production
 *   initiatePayment({ payment, order })  – create a provider-side charge attempt
 *   verifyPayment({ providerRef })       – poll/query the provider for the
 *                                          authoritative result of a charge
 *   verifyWebhook({ rawBody, headers })  – validate signature authenticity and
 *                                          return the NORMALIZED event payload
 *
 * Normalized event shape returned by verifyWebhook (after signature validation):
 *   { providerRef, orderNumber, amountUgx, currency, outcome: 'SUCCESS'|'FAILED',
 *     resultCode, failureMessage?, occurredAt }
 *
 * Normalized initiate/verify shape:
 *   { ok, providerRef, outcome?, resultCode?, failureMessage?, raw? }
 *
 * ══════════════════════════════════════════════════════════════════════════
 * REAL PROVIDER INTEGRATION BOUNDARY (future phase):
 *   Add e.g. `mockProvider.js`-style adapters (flutterwaveProvider.js,
 *   mtnMomoProvider.js, …) next to this file, implement the three operations
 *   above against the provider's real API/SDK, then register the provider in
 *   PROVIDER_REGISTRY below. No other file changes should be required: the
 *   active provider is selected purely by env PAYMENT_PROVIDER. Webhook
 *   route mounting already expects a provider-specific webhook path per
 *   adapter (see docs/PAYMENTS_API.md).
 * ══════════════════════════════════════════════════════════════════════════
 */

const mockProvider = require('./mockProvider');

const PROVIDER_REGISTRY = {
  MOCK: mockProvider,
  // FLUTTERWAVE: require('./flutterwaveProvider'), // future phase
  // MTN_MOMO:    require('./mtnMomoProvider'),    // future phase
};

function getPaymentProvider(name) {
  const provider = PROVIDER_REGISTRY[String(name || '').toUpperCase()];
  if (!provider) {
    throw new Error(`Unknown payment provider configured: ${name}`);
  }
  return provider;
}

module.exports = {
  getPaymentProvider,
  PROVIDER_REGISTRY,
};
