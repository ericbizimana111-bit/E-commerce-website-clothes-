const { z } = require('zod');

const uuidSchema = z
  .string({ invalid_type_error: 'ID must be a string' })
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'ID must be a valid UUID');

const orderLanguageSchema = z
  .string({ invalid_type_error: 'language must be a string' })
  .trim()
  .regex(/^(en|lg|fr|sw)$/i, 'Unsupported language. Supported languages: en, lg, fr, sw')
  .optional()
  .default('en');

// Initiation body: the client may specify NOTHING financially meaningful.
// amount/currency/status/paymentStatus/providerRef/etc. are stripped by the
// transform (server is authoritative). Payment outcomes come ONLY from
// signed provider webhooks — never from this endpoint.
const initiatePaymentSchema = {
  params: z.object({
    id: uuidSchema,
  }),
  body: z
    .object({
      language: orderLanguageSchema,
      // Mass-assignment protection: always stripped (incl. dev/test levers)
      mockOutcome: z.unknown().optional(),
      amount: z.unknown().optional(),
      amountUgx: z.unknown().optional(),
      currency: z.unknown().optional(),
      status: z.unknown().optional(),
      paymentStatus: z.unknown().optional(),
      paid: z.unknown().optional(),
      providerRef: z.unknown().optional(),
      transactionRef: z.unknown().optional(),
      provider: z.unknown().optional(),
      orderId: z.unknown().optional(),
      userId: z.unknown().optional(),
    })
    .transform((body) => ({
      language: body.language,
    })),
};

const paymentParamsSchema = {
  params: z.object({
    id: uuidSchema,
  }),
};

const adminPaymentParamsSchema = {
  params: z.object({
    id: uuidSchema,
  }),
};

module.exports = {
  initiatePaymentSchema,
  paymentParamsSchema,
  adminPaymentParamsSchema,
};
