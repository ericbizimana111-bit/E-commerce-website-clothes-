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

const createOrderSchema = {
  body: z
    .object({
      fulfillmentMethod: z.enum(['HOME_DELIVERY', 'PICKUP_STATION'], {
        errorMap: () => ({ message: 'fulfillmentMethod must be HOME_DELIVERY or PICKUP_STATION' }),
      }),
      addressId: uuidSchema.nullable().optional(),
      pickupStationId: z
        .number({ invalid_type_error: 'pickupStationId must be a number' })
        .int('pickupStationId must be an integer')
        .positive('pickupStationId must be a positive integer')
        .nullable()
        .optional(),
      notes: z.string().trim().max(1000).optional(),
      language: orderLanguageSchema,
      // Mass-assignment protection: these are ALWAYS server-derived and stripped
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
      fulfillmentMethod: body.fulfillmentMethod,
      addressId: body.addressId ?? null,
      pickupStationId: body.pickupStationId ?? null,
      notes: body.notes ?? null,
      language: body.language,
    }))
    .refine(
      (body) => {
        if (body.fulfillmentMethod === 'HOME_DELIVERY') return !!body.addressId;
        return !!body.pickupStationId;
      },
      {
        message: 'addressId is required for HOME_DELIVERY and pickupStationId is required for PICKUP_STATION',
        path: ['fulfillmentMethod'],
      }
    ),
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
  createOrderSchema,
  orderLanguageQuerySchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
  cancelOrderSchema,
  adminUpdateStatusSchema,
};
