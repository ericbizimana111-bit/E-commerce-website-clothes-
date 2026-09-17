const { z } = require('zod');

const uuidSchema = z
  .string({ invalid_type_error: 'ID must be a string' })
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'ID must be a valid UUID');

const checkoutPreviewSchema = {
  body: z
    .object({
      fulfillmentMethod: z
        .enum(['HOME_DELIVERY', 'PICKUP_STATION'], {
          errorMap: () => ({ message: 'fulfillmentMethod must be HOME_DELIVERY or PICKUP_STATION' }),
        }),
      addressId: uuidSchema.nullable().optional(),
      pickupStationId: z
        .number({ invalid_type_error: 'pickupStationId must be a number' })
        .int('pickupStationId must be an integer')
        .positive('pickupStationId must be a positive integer')
        .nullable()
        .optional(),
      // Mass-assignment protection: client can never supply totals/prices/ids of other resources
      subtotalUgx: z.unknown().optional(),
      deliveryFeeUgx: z.unknown().optional(),
      totalUgx: z.unknown().optional(),
      commitmentUgx: z.unknown().optional(),
      remainingBalanceUgx: z.unknown().optional(),
      userId: z.unknown().optional(),
    })
    .transform((body) => ({
      fulfillmentMethod: body.fulfillmentMethod,
      addressId: body.addressId ?? null,
      pickupStationId: body.pickupStationId ?? null,
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

module.exports = {
  checkoutPreviewSchema,
};
