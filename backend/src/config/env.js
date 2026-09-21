const { z } = require('zod');
const dotenv = require('dotenv');

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  // Bind address. 0.0.0.0 (all interfaces) is required for container
  // deployment; local development is unaffected since it also serves
  // localhost.
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ADMIN_JWT_SECRET: z.string().min(16, 'ADMIN_JWT_SECRET must be at least 16 characters'),
  ADMIN_JWT_EXPIRES_IN: z.string().default('1d'),
  
  // Initial admin credentials for seeding
  ADMIN_1_EMAIL: z.string().email().default('admin@ugandafood.market'),
  ADMIN_1_PASSWORD: z.string().min(8).default('AdminSecurePass123!'),
  ADMIN_1_NAME: z.string().default('Primary Admin'),
  ADMIN_2_EMAIL: z.string().email().default('operations@ugandafood.market'),
  ADMIN_2_PASSWORD: z.string().min(8).default('OpsSecurePass123!'),
  ADMIN_2_NAME: z.string().default('Operations Manager'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),

  // Warehouse origin
  WAREHOUSE_LATITUDE: z.coerce.number().default(0.3136),
  WAREHOUSE_LONGITUDE: z.coerce.number().default(32.5811),

  // Payment
  PAYMENT_PROVIDER: z.enum(['MOCK', 'FLUTTERWAVE', 'MTN_MOMO', 'AIRTEL_MONEY']).default('MOCK'),
  // TEST (sandbox) | LIVE. Real credentials are only required in production
  // (validated in config/envValidation.js); tests never need them.
  PAYMENT_MODE: z.enum(['TEST', 'LIVE']).default('TEST'),
  // Flutterwave credentials. Empty defaults keep development/test running
  // without any real credentials (tests must never call the real API).
  FLW_PUBLIC_KEY: z.string().default(''),
  FLW_SECRET_KEY: z.string().default(''),
  // Card payment redirect URL: Flutterwave redirects the customer here after
  // hosted-checkout completion. Must be a public HTTPS URL in production.
  // Not required for mobile money payments or the MOCK provider.
  FLW_RETURN_URL: z.string().default(''),
  PAYMENT_WEBHOOK_SECRET: z.string().default('ufm_mock_webhook_secret_2026'),
  PAYMENT_ATTEMPT_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  // Frontend base URL: used by the return-URL handler to build the redirect
  // target after card payment. Defaults to the CRA dev server.
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Delivery Pricing
  DELIVERY_BASE_FEE: z.coerce.number().default(3000),
  DELIVERY_FREE_RADIUS_KM: z.coerce.number().default(3.0),
  DELIVERY_PER_KM_RATE: z.coerce.number().default(1200),
  DELIVERY_MINIMUM_FEE: z.coerce.number().default(3000),

  // Commitment
  COMMITMENT_RULE_TYPE: z.enum(['PERCENTAGE', 'FLAT', 'TIERED']).default('PERCENTAGE'),
  COMMITMENT_PERCENTAGE: z.coerce.number().default(30.0),
  COMMITMENT_MIN_AMOUNT: z.coerce.number().default(5000),
});

const { validateProductionConfig } = require('./envValidation');

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment configuration validation failed:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

// Environment-aware production hardening: production startup fails fast on
// missing or unsafe security configuration (see config/envValidation.js for
// the exact rules). Development and test keep their practical defaults so
// existing workflows and the test suite are unaffected. Messages identify
// variable names only — secret values are never printed.
if (parsed.data.NODE_ENV === 'production') {
  const problems = validateProductionConfig(parsed.data, process.env);
  if (problems.length > 0) {
    console.error('❌ Production environment configuration is invalid:');
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    console.error('Fix the environment configuration and restart. Secret values are never shown.');
    process.exit(1);
  }
}

module.exports = parsed.data;
