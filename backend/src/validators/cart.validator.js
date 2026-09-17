const { z } = require('zod');

// ============================================================
// Quantity: strict positive integer with server-side maximum.
// Rejects 0, negatives, decimals, NaN, Infinity, huge values.
// ============================================================
const quantitySchema = z
  .number({ required_error: 'Quantity is required', invalid_type_error: 'Quantity must be a number' })
  .int('Quantity must be an integer')
  .gt(0, 'Quantity must be at least 1')
  .lte(1000, 'Quantity cannot exceed 1000')
  .finite('Quantity must be a finite number');

const productIdSchema = z
  .number({ required_error: 'productId is required', invalid_type_error: 'productId must be a number' })
  .int('productId must be an integer')
  .positive('productId must be a positive integer')
  .finite('productId must be a finite number');

const cartItemIdSchema = z
  .string({ required_error: 'Cart item ID is required', invalid_type_error: 'Cart item ID must be a string' })
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Cart item ID must be a valid UUID'
  );

// Language query: strict, same contract as public catalog endpoints.
// Case-insensitive acceptance for en/lg/fr/sw; anything else -> 400.
const cartLanguageQuerySchema = {
  query: z.object({
    lang: z
      .string({ invalid_type_error: 'lang must be a string' })
      .trim()
      .regex(/^(en|lg|fr|sw)$/i, 'Unsupported language. Supported languages: en, lg, fr, sw')
      .optional()
      .default('en'),
  }),
};

const addItemSchema = {
  body: z
    .object({
      productId: productIdSchema,
      quantity: quantitySchema,
      // Mass-assignment protection: these fields are ALWAYS server-derived.
      // They are stripped before the body reaches any service/controller.
      priceUgx: z.unknown().optional(),
      unitPriceUgx: z.unknown().optional(),
      subtotalUgx: z.unknown().optional(),
      userId: z.unknown().optional(),
      cartId: z.unknown().optional(),
    })
    .transform((body) => ({
      productId: body.productId,
      quantity: body.quantity,
    })),
};

const updateItemSchema = {
  params: z.object({
    itemId: cartItemIdSchema,
  }),
  body: z
    .object({
      quantity: quantitySchema,
      priceUgx: z.unknown().optional(),
      subtotalUgx: z.unknown().optional(),
      userId: z.unknown().optional(),
    })
    .transform((body) => ({
      quantity: body.quantity,
    })),
};

const itemIdParamsSchema = {
  params: z.object({
    itemId: cartItemIdSchema,
  }),
};

module.exports = {
  quantitySchema,
  productIdSchema,
  addItemSchema,
  updateItemSchema,
  itemIdParamsSchema,
  cartLanguageQuerySchema,
};
