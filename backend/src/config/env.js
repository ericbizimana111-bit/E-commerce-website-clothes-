const { z } = require('zod');
const dotenv = require('dotenv');

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
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
  PAYMENT_WEBHOOK_SECRET: z.string().default('ufm_mock_webhook_secret_2026'),
  PAYMENT_ATTEMPT_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),

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
