const { z } = require('zod');

const uuidSchema = z
  .string({ invalid_type_error: 'ID must be a string' })
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'ID must be a valid UUID',
  );

const listCustomersQuerySchema = {
  query: z.object({
    page: z
      .string()
      .regex(/^\d+$/, 'page must be a positive integer')
      .optional(),
    limit: z
      .string()
      .regex(/^\d+$/, 'limit must be a positive integer')
      .optional(),
    search: z.string().trim().max(200).optional(),
  }),
};

const customerIdParamSchema = {
  params: z.object({
    id: uuidSchema,
  }),
};

module.exports = { listCustomersQuerySchema, customerIdParamSchema };
