/**
 * Configuration validation tests (Phase 11 Step 2).
 *
 * These tests exercise config/envValidation.js PURELY: validateProductionConfig
 * takes a config object + raw env and returns problems. Nothing here touches
 * the database, spawns the app, or reads the real backend/.env.
 *
 * Note: we do NOT require('../config/env') in this file — requiring it would
 * bind the real environment at import time. The pure module is the unit under
 * test; env.js's wiring (exit on production problems) is intentionally thin.
 */

const {
  validateProductionConfig,
  PRODUCTION_MIN_SECRET_LENGTH,
} = require('../src/config/envValidation');

const LONG = 'a'.repeat(32);
const LONG2 = 'b'.repeat(32);

// A fully valid production configuration.
function validProductionConfig(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:password@db.example.com:5432/uganda_food_marketplace?schema=public',
    JWT_SECRET: LONG,
    JWT_EXPIRES_IN: '7d',
    ADMIN_JWT_SECRET: LONG2,
    ADMIN_JWT_EXPIRES_IN: '1d',
    ADMIN_1_EMAIL: 'admin@example.com',
    ADMIN_1_PASSWORD: 'Str0ngProductionPass!x',
    ADMIN_1_NAME: 'Primary Admin',
    ADMIN_2_EMAIL: 'ops@example.com',
    ADMIN_2_PASSWORD: 'An0therStr0ngPass!y',
    ADMIN_2_NAME: 'Operations Manager',
    CORS_ORIGIN: 'https://shop.example.com,https://admin.example.com',
    PAYMENT_PROVIDER: 'FLUTTERWAVE',
    PAYMENT_MODE: 'TEST',
    // Dashboard-shaped TEST credentials (NOT real secrets; safe in TEST mode
    // production while PAYMENT_MODE=TEST — see rule 7 in envValidation.js).
    FLW_PUBLIC_KEY: 'FLWPUBK_TEST-0123456789abcdef0123456789abcdef',
    FLW_SECRET_KEY: 'FLWSECK_TEST-0123456789abcdef0123456789abcdef',
    PAYMENT_WEBHOOK_SECRET: 'w'.repeat(32),
    PAYMENT_ATTEMPT_TTL_MINUTES: 30,
    ...overrides,
  };
}

describe('validateProductionConfig (production environment validation)', () => {
  describe('valid configuration passes', () => {
    test('accepts a fully valid production configuration', () => {
      expect(validateProductionConfig(validProductionConfig(), validProductionConfig())).toEqual([]);
    });

    test('accepts explicit CORS origins provided via raw env only', () => {
      const config = validProductionConfig();
      // Simulate CORS_ORIGIN coming only from the parsed schema default path
      // while being genuinely present in the raw environment.
      expect(validateProductionConfig(config, { ...config, CORS_ORIGIN: 'https://shop.example.com' })).toEqual([]);
    });
  });

  describe('required secrets must exist in production', () => {
    test('rejects missing PAYMENT_WEBHOOK_SECRET (no insecure default allowed)', () => {
      const config = validProductionConfig();
      const raw = { ...config };
      delete raw.PAYMENT_WEBHOOK_SECRET;
      const problems = validateProductionConfig(config, raw);
      expect(problems).toContainEqual(
        expect.stringContaining('PAYMENT_WEBHOOK_SECRET is required in production')
      );
    });

    test('rejects missing ADMIN_1_PASSWORD and ADMIN_2_PASSWORD', () => {
      const config = validProductionConfig();
      const raw = { ...config };
      delete raw.ADMIN_1_PASSWORD;
      delete raw.ADMIN_2_PASSWORD;
      const problems = validateProductionConfig(config, raw);
      expect(problems.some((p) => p.includes('ADMIN_1_PASSWORD is required in production'))).toBe(true);
      expect(problems.some((p) => p.includes('ADMIN_2_PASSWORD is required in production'))).toBe(true);
    });

    test('rejects blank-string secrets', () => {
      const config = validProductionConfig();
      const raw = { ...config, PAYMENT_WEBHOOK_SECRET: '   ' };
      const problems = validateProductionConfig(config, raw);
      expect(problems).toContainEqual(
        expect.stringContaining('PAYMENT_WEBHOOK_SECRET is required in production')
      );
    });
  });

  describe('insecure defaults and placeholders are rejected', () => {
    test('rejects the historical mock webhook secret default', () => {
      const config = validProductionConfig({ PAYMENT_WEBHOOK_SECRET: 'ufm_mock_webhook_secret_2026' });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(
        expect.stringContaining('PAYMENT_WEBHOOK_SECRET is set to a known insecure placeholder/default')
      );
    });

    test('rejects .env.example placeholder webhook secret', () => {
      const config = validProductionConfig({ PAYMENT_WEBHOOK_SECRET: 'replace_with_webhook_signature_secret' });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(
        expect.stringContaining('PAYMENT_WEBHOOK_SECRET is set to a known insecure placeholder/default')
      );
    });

    test('rejects historical insecure admin password defaults', () => {
      const config = validProductionConfig({
        ADMIN_1_PASSWORD: 'AdminSecurePass123!',
        ADMIN_2_PASSWORD: 'OpsSecurePass123!',
      });
      const problems = validateProductionConfig(config, config);
      expect(problems.some((p) => p.includes('ADMIN_1_PASSWORD is set to a known insecure placeholder/default'))).toBe(true);
      expect(problems.some((p) => p.includes('ADMIN_2_PASSWORD is set to a known insecure placeholder/default'))).toBe(true);
    });

    test('rejects .env.example placeholder admin passwords', () => {
      const config = validProductionConfig({
        ADMIN_1_PASSWORD: 'change_this_admin_password_in_env',
        ADMIN_2_PASSWORD: 'change_this_ops_password_in_env',
      });
      const problems = validateProductionConfig(config, config);
      expect(problems.some((p) => p.includes('ADMIN_1_PASSWORD is set to a known insecure placeholder/default'))).toBe(true);
      expect(problems.some((p) => p.includes('ADMIN_2_PASSWORD is set to a known insecure placeholder/default'))).toBe(true);
    });
  });

  describe('secret quality', () => {
    test('requires at least 32 characters for JWT/webhook secrets', () => {
      expect(PRODUCTION_MIN_SECRET_LENGTH).toBe(32);
      const config = validProductionConfig({
        JWT_SECRET: 'short_but_dev_ok_16ch',
        ADMIN_JWT_SECRET: 'also_short_16ch_x',
        PAYMENT_WEBHOOK_SECRET: 'x'.repeat(16),
      });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(expect.stringContaining('JWT_SECRET must be at least 32 characters'));
      expect(problems).toContainEqual(expect.stringContaining('ADMIN_JWT_SECRET must be at least 32 characters'));
      expect(problems).toContainEqual(expect.stringContaining('PAYMENT_WEBHOOK_SECRET must be at least 32 characters'));
    });
  });

  describe('JWT secret separation', () => {
    test('rejects identical customer and admin JWT secrets', () => {
      const config = validProductionConfig({ JWT_SECRET: LONG, ADMIN_JWT_SECRET: LONG });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(
        expect.stringContaining('JWT_SECRET and ADMIN_JWT_SECRET must be different')
      );
    });
  });

  describe('CORS', () => {
    test('rejects missing CORS_ORIGIN in production', () => {
      const config = validProductionConfig();
      const raw = { ...config };
      delete raw.CORS_ORIGIN;
      const problems = validateProductionConfig(config, raw);
      expect(problems).toContainEqual(expect.stringContaining('CORS_ORIGIN is required in production'));
    });

    test('rejects wildcard CORS origin in production', () => {
      const config = validProductionConfig({ CORS_ORIGIN: '*' });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(expect.stringContaining('must not contain the wildcard'));
    });

    test('rejects wildcard inside a comma-separated list', () => {
      const config = validProductionConfig({ CORS_ORIGIN: 'https://shop.example.com, *' });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(expect.stringContaining('must not contain the wildcard'));
    });

    test('rejects an empty origin list', () => {
      const config = validProductionConfig({ CORS_ORIGIN: '  ,  ' });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(expect.stringContaining('at least one explicit origin'));
    });
  });

  describe('mock payment provider safety', () => {
    test('rejects PAYMENT_PROVIDER=MOCK in production', () => {
      const config = validProductionConfig({ PAYMENT_PROVIDER: 'MOCK' });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(expect.stringContaining('PAYMENT_PROVIDER=MOCK is not allowed in production'));
    });

    test('rejects lowercase mock value too', () => {
      const config = validProductionConfig({ PAYMENT_PROVIDER: 'mock' });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(expect.stringContaining('PAYMENT_PROVIDER=MOCK is not allowed in production'));
    });
  });

  describe('Flutterwave credentials (Phase 12 Step 2)', () => {
    test('accepts dashboard-shaped TEST keys in production while PAYMENT_MODE=TEST', () => {
      const problems = validateProductionConfig(validProductionConfig(), validProductionConfig());
      expect(problems).toEqual([]);
    });

    test('rejects missing FLW credentials in production with FLUTTERWAVE provider', () => {
      const config = validProductionConfig({ FLW_PUBLIC_KEY: '', FLW_SECRET_KEY: '' });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(expect.stringContaining('FLW_PUBLIC_KEY is required in production'));
      expect(problems).toContainEqual(expect.stringContaining('FLW_SECRET_KEY is required in production'));
    });

    test('rejects obvious placeholder FLW credentials', () => {
      const config = validProductionConfig({
        FLW_PUBLIC_KEY: 'replace_with_your_public_key',
        FLW_SECRET_KEY: 'xxxxxxxxxxxxxxxx',
      });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(expect.stringContaining('FLW_PUBLIC_KEY is set to an obvious placeholder'));
      expect(problems).toContainEqual(expect.stringContaining('FLW_SECRET_KEY is set to an obvious placeholder'));
    });

    test('rejects TEST keys when PAYMENT_MODE=LIVE', () => {
      const config = validProductionConfig({ PAYMENT_MODE: 'LIVE' });
      const problems = validateProductionConfig(config, config);
      expect(problems).toContainEqual(expect.stringContaining('FLW_PUBLIC_KEY looks like a TEST key'));
      expect(problems).toContainEqual(expect.stringContaining('FLW_SECRET_KEY looks like a TEST key'));
    });

    test('ACCEPTS TEST keys in LIVE mode check only via _TEST- marker — non-TEST LIVE keys pass', () => {
      const config = validProductionConfig({
        PAYMENT_MODE: 'LIVE',
        FLW_PUBLIC_KEY: 'FLWPUBK-0123456789abcdef0123456789',
        FLW_SECRET_KEY: 'FLWSECK-0123456789abcdef0123456789',
      });
      const problems = validateProductionConfig(config, config);
      expect(problems).toEqual([]);
    });

    test('does not enforce FLW credentials when provider is not FLUTTERWAVE', () => {
      // MOCK is separately rejected; a hypothetical other provider (e.g.
      // MTN_MOMO) must not be blocked by FLW rules — check via a provider the
      // schema allows besides MOCK/FLUTTERWAVE.
      const config = validProductionConfig({ PAYMENT_PROVIDER: 'MTN_MOMO', FLW_PUBLIC_KEY: '', FLW_SECRET_KEY: '' });
      const problems = validateProductionConfig(config, config);
      expect(problems).toEqual([]);
    });
  });

  describe('error message hygiene', () => {
    test('problem messages never contain secret values', () => {
      const secretValue = 'SUPER_SECRET_VALUE_never_print_9f8e7d6c';
      const config = validProductionConfig({
        JWT_SECRET: secretValue,
        ADMIN_JWT_SECRET: secretValue, // also triggers the equality rule
        PAYMENT_WEBHOOK_SECRET: 'x'.repeat(31), // triggers the length rule
      });
      const problems = validateProductionConfig(config, config);
      expect(problems.length).toBeGreaterThan(0);
      for (const problem of problems) {
        expect(problem).not.toContain(secretValue);
      }
    });
  });
});
