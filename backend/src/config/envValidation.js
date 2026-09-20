/**
 * Production security validation for environment configuration.
 *
 * Pure, side-effect-free module: takes the already-parsed config object and
 * the RAW process.env, and returns a list of human-readable problems.
 * Messages identify variable names and reasons ONLY — secret values are never
 * included here, in startup logs, or in error output.
 *
 * Invoked ONLY when NODE_ENV=production (see config/env.js). Development and
 * test keep their practical defaults so existing workflows and tests are
 * unaffected.
 */

// Documented placeholders (backend/.env.example) and historical insecure
// defaults that must never reach production.
const PRODUCTION_FORBIDDEN_VALUES = {
  JWT_SECRET: ['replace_with_a_secure_random_secret_at_least_32_chars'],
  ADMIN_JWT_SECRET: ['replace_with_a_different_secure_secret_for_admins'],
  PAYMENT_WEBHOOK_SECRET: [
    'replace_with_webhook_signature_secret',
    'ufm_mock_webhook_secret_2026', // historical insecure mock default
  ],
  ADMIN_1_PASSWORD: [
    'change_this_admin_password_in_env',
    'AdminSecurePass123!', // historical insecure code default
  ],
  ADMIN_2_PASSWORD: [
    'change_this_ops_password_in_env',
    'OpsSecurePass123!', // historical insecure code default
  ],
};

// Minimum secret length for cryptographic use in production.
// (Development/test keep the existing schema minimum of 16.)
const PRODUCTION_MIN_SECRET_LENGTH = 32;

// Variables that carry insecure development defaults in the zod schema, so in
// production they must be EXPLICITLY provided via the environment (presence is
// checked against the RAW environment, not the parsed/defaulted config).
const PRODUCTION_REQUIRED_RAW = [
  'PAYMENT_WEBHOOK_SECRET',
  'ADMIN_1_PASSWORD',
  'ADMIN_2_PASSWORD',
];

const PRODUCTION_SECRET_VARS = ['JWT_SECRET', 'ADMIN_JWT_SECRET', 'PAYMENT_WEBHOOK_SECRET'];

function validateProductionConfig(config, rawEnv = {}) {
  const problems = [];

  // 1. No silent fallback to insecure defaults.
  for (const variable of PRODUCTION_REQUIRED_RAW) {
    const raw = rawEnv[variable];
    if (raw === undefined || String(raw).trim() === '') {
      problems.push(
        `${variable} is required in production (no insecure default is allowed).`
      );
    }
  }

  // 2. Known placeholders / insecure defaults are rejected.
  for (const [variable, forbidden] of Object.entries(PRODUCTION_FORBIDDEN_VALUES)) {
    const value = config[variable] !== undefined ? String(config[variable]) : '';
    if (value !== '' && forbidden.includes(value)) {
      problems.push(
        `${variable} is set to a known insecure placeholder/default and is rejected in production.`
      );
    }
  }

  // 3. Minimum secret quality for cryptographic use.
  for (const variable of PRODUCTION_SECRET_VARS) {
    const value = config[variable] !== undefined ? String(config[variable]) : '';
    if (value !== '' && value.length < PRODUCTION_MIN_SECRET_LENGTH) {
      problems.push(
        `${variable} must be at least ${PRODUCTION_MIN_SECRET_LENGTH} characters in production.`
      );
    }
  }

  // 4. Customer and admin JWT contexts must use different secrets.
  if (
    config.JWT_SECRET &&
    config.ADMIN_JWT_SECRET &&
    String(config.JWT_SECRET) === String(config.ADMIN_JWT_SECRET)
  ) {
    problems.push('JWT_SECRET and ADMIN_JWT_SECRET must be different in production.');
  }

  // 5. CORS: explicit origins required (credentials are enabled, so a wildcard
  // is dangerous and must never be used in production). The zod schema applies
  // a development localhost default, so presence is checked against the RAW
  // environment — an unset value must never silently fall back to dev origins.
  const corsOrigin = String(config.CORS_ORIGIN || '');
  if (rawEnv.CORS_ORIGIN === undefined || String(rawEnv.CORS_ORIGIN).trim() === '') {
    problems.push(
      'CORS_ORIGIN is required in production (explicit origins; the development localhost default must not be used).'
    );
  } else {
    const origins = corsOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (origins.includes('*')) {
      problems.push(
        'CORS_ORIGIN must not contain the wildcard "*" in production (credentials are enabled).'
      );
    }
    if (origins.length === 0) {
      problems.push('CORS_ORIGIN must list at least one explicit origin in production.');
    }
  }

  // 6. The mock payment provider must never be selected in production.
  if (String(config.PAYMENT_PROVIDER || '').toUpperCase() === 'MOCK') {
    problems.push('PAYMENT_PROVIDER=MOCK is not allowed in production.');
  }

  // 7. Flutterwave: production (or any LIVE mode) requires REAL credentials.
  // Placeholder strings from docs/examples are rejected, as are degenerate
  // values. Real dashboard-issued TEST keys (FLWPUBK_TEST-…/FLWSECK_TEST-…)
  // remain acceptable in production while PAYMENT_MODE=TEST (sandbox), but
  // are rejected when PAYMENT_MODE=LIVE. Only variable NAMES are reported.
  const provider = String(config.PAYMENT_PROVIDER || '').toUpperCase();
  const mode = String(config.PAYMENT_MODE || 'TEST').toUpperCase();
  if (provider === 'FLUTTERWAVE' && (mode === 'LIVE' || config.NODE_ENV === 'production')) {
    const flwCreds = [
      { name: 'FLW_PUBLIC_KEY', value: String(config.FLW_PUBLIC_KEY || '') },
      { name: 'FLW_SECRET_KEY', value: String(config.FLW_SECRET_KEY || '') },
    ];
    for (const { name, value } of flwCreds) {
      const trimmed = value.trim();
      if (!trimmed) {
        problems.push(
          `${name} is required in production when PAYMENT_PROVIDER=FLUTTERWAVE (no default is allowed).`
        );
      } else if (looksLikeFlutterwavePlaceholder(trimmed)) {
        problems.push(
          `${name} is set to an obvious placeholder/dummy value and is rejected in production.`
        );
      }
    }
    if (mode === 'LIVE') {
      if (String(config.FLW_PUBLIC_KEY || '').includes('_TEST-')) {
        problems.push(
          'PAYMENT_MODE=LIVE is configured but FLW_PUBLIC_KEY looks like a TEST key (contains "_TEST-").'
        );
      }
      if (String(config.FLW_SECRET_KEY || '').includes('_TEST-')) {
        problems.push(
          'PAYMENT_MODE=LIVE is configured but FLW_SECRET_KEY looks like a TEST key (contains "_TEST-").'
        );
      }
    }
  }

  return problems;
}

// Placeholder/dummy shapes for Flutterwave keys: documented example tokens
// ("placeholder", "example", "dummy", "replace", runs of the same character)
// and degenerate values. NOTE: real dashboard-issued TEST keys contain
// "_TEST-" and are NOT placeholders — the TEST/LIVE mismatch is checked
// separately below.
const FLW_PLACEHOLDER_PATTERN = /(placeholder|example|dummy|replace|xxxxx)/i;

function looksLikeFlutterwavePlaceholder(value) {
  if (!value || value.length < 8) return true;
  if (FLW_PLACEHOLDER_PATTERN.test(value)) return true;
  const unique = new Set(value.toLowerCase()).size;
  return unique <= 2; // e.g. "xxxxxxxx", "0000000000"
}

module.exports = {
  validateProductionConfig,
  looksLikeFlutterwavePlaceholder,
  PRODUCTION_MIN_SECRET_LENGTH,
  PRODUCTION_REQUIRED_RAW,
  PRODUCTION_FORBIDDEN_VALUES,
  PRODUCTION_SECRET_VARS,
};
