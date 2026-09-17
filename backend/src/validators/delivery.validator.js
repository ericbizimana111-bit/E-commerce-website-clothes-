const { z } = require('zod');

const uuidSchema = z
  .string({ invalid_type_error: 'ID must be a string' })
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'ID must be a valid UUID');

const deliveryStatusEnum = z.enum([
  'PENDING',
  'ASSIGNED',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PICKED_UP',
  'FAILED',
  'CANCELLED',
]);

const fulfillmentTypeEnum = z.enum(['HOME_DELIVERY', 'PICKUP_STATION']);

const deliveryFailureReasonEnum = z.enum([
  'CUSTOMER_UNAVAILABLE',
  'INVALID_ADDRESS',
  'DRIVER_UNABLE_TO_COMPLETE',
  'PICKUP_STATION_ISSUE',
  'OTHER',
]);

// Customer: GET /api/orders/:id/delivery
const deliveryForOrderParamsSchema = {
  params: z.object({ id: uuidSchema }),
};

// Admin: GET /api/admin/deliveries (paginated, filterable)
const listDeliveriesQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      status: deliveryStatusEnum.optional(),
      fulfillmentType: fulfillmentTypeEnum.optional(),
      assignedAdminId: uuidSchema.optional(),
      orderNumber: z.string().trim().min(1).max(32).optional(),
    })
    .strip(),
};

// Admin: GET /api/admin/deliveries/:id
const deliveryIdParamsSchema = {
  params: z.object({ id: uuidSchema }),
};

// Admin: PATCH /api/admin/deliveries/:id/assign
const assignDeliverySchema = {
  params: z.object({ id: uuidSchema }),
  body: z
    .object({
      assignedAdminId: uuidSchema,
      notes: z.string().trim().min(1).max(500).optional(),
      // Mass-assignment protection: always stripped
      customerId: z.unknown().optional(),
      userId: z.unknown().optional(),
      status: z.unknown().optional(),
      deliveryFee: z.unknown().optional(),
      deliveryFeeUgx: z.unknown().optional(),
      distanceKm: z.unknown().optional(),
    })
    .transform((b) => ({ assignedAdminId: b.assignedAdminId, notes: b.notes ?? null })),
};

// Admin: PATCH /api/admin/deliveries/:id/status
const updateDeliveryStatusSchema = {
  params: z.object({ id: uuidSchema }),
  body: z
    .object({
      status: deliveryStatusEnum,
      failureReason: deliveryFailureReasonEnum.optional(),
      failureMessage: z.string().trim().min(1).max(500).optional(),
      notes: z.string().trim().min(1).max(500).optional(),
      scheduledAt: z.coerce.date().optional(),
      // Mass-assignment protection: always stripped
      orderId: z.unknown().optional(),
      orderStatus: z.unknown().optional(),
      deliveryFee: z.unknown().optional(),
      distanceKm: z.unknown().optional(),
      assignedAdminId: z.unknown().optional(),
    })
    .transform((b) => ({
      status: b.status,
      failureReason: b.failureReason ?? null,
      failureMessage: b.failureMessage ?? null,
      notes: b.notes ?? null,
      scheduledAt: b.scheduledAt,
    })),
};

module.exports = {
  deliveryForOrderParamsSchema,
  listDeliveriesQuerySchema,
  deliveryIdParamsSchema,
  assignDeliverySchema,
  updateDeliveryStatusSchema,
  deliveryStatusEnum,
  fulfillmentTypeEnum,
  deliveryFailureReasonEnum,
};
