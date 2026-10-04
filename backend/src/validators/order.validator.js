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

const statusEnum = z.enum([
  'PENDING_PAYMENT',
  'COMMITMENT_PAID',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_DELIVERY',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PICKED_UP',
  'BALANCE_PAID',
  'COMPLETED',
  'CANCELLED',
  'PAYMENT_FAILED',
  'DELIVERY_FAILED',
  'REFUNDED',
]);

// UgaMarket is delivery-only: every order goes to a validated customer
// address. fulfillmentMethod is optional for backwards compatibility but
// may only be HOME_DELIVERY; pickup requests are refused with a clear message.
const deliveryOnlyMethod = z
  .enum(['HOME_DELIVERY', 'PICKUP_STATION'], {
    errorMap: () => ({ message: 'fulfillmentMethod must be HOME_DELIVERY' }),
  })
  .optional()
  .default('HOME_DELIVERY')
  .refine((m) => m === 'HOME_DELIVERY', {
    message: 'Pickup is no longer available. UgaMarket delivers every order to your address.',
  });

const createOrderSchema = {
  body: z
    .object({
      fulfillmentMethod: deliveryOnlyMethod,
      addressId: uuidSchema.nullable().optional(),
      notes: z.string().trim().max(1000).optional(),
      language: orderLanguageSchema,
      // Mass-assignment protection: these are ALWAYS server-derived and stripped
      pickupStationId: z.unknown().optional(),
      userId: z.unknown().optional(),
      orderNumber: z.unknown().optional(),
      status: z.unknown().optional(),
      subtotalUgx: z.unknown().optional(),
      deliveryFeeUgx: z.unknown().optional(),
      totalUgx: z.unknown().optional(),
      commitmentUgx: z.unknown().optional(),
      remainingBalanceUgx: z.unknown().optional(),
      currency: z.unknown().optional(),
      items: z.unknown().optional(),
    })
    .transform((body) => ({
      fulfillmentMethod: 'HOME_DELIVERY',
      addressId: body.addressId ?? null,
      notes: body.notes ?? null,
      language: body.language,
    }))
    .refine((body) => !!body.addressId, {
      message: 'addressId is required: choose or add a delivery address',
      path: ['addressId'],
    }),
};

const orderLanguageQuerySchema = {
  query: z.object({
    lang: orderLanguageSchema,
  }),
};

const listOrdersQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
    status: z.string().trim().max(200).optional(),
    fulfillmentMethod: z.enum(['HOME_DELIVERY', 'PICKUP_STATION']).optional(),
    search: z.string().trim().max(100).optional(),
    district: z.string().trim().max(100).optional(),
    lang: orderLanguageSchema,
  }),
};

const orderIdParamsSchema = {
  params: z.object({
    id: uuidSchema,
  }),
};

const cancelOrderSchema = {
  params: z.object({
    id: uuidSchema,
  }),
  body: z
    .object({
      reason: z.string().trim().max(500).optional(),
      status: z.unknown().optional(), // stripped: clients cannot set status here
      userId: z.unknown().optional(),
    })
    .transform((body) => ({
      reason: body.reason ?? null,
    })),
};

const adminUpdateStatusSchema = {
  params: z.object({
    id: uuidSchema,
  }),
  body: z
    .object({
      status: statusEnum,
      reason: z.string().trim().max(500).optional(),
    })
    .transform((body) => ({
      status: body.status,
      reason: body.reason ?? null,
    })),
};

module.exports = {
  deliveryOnlyMethod,
  createOrderSchema,
  orderLanguageQuerySchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
  cancelOrderSchema,
  adminUpdateStatusSchema,
};
