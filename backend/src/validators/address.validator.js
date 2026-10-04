const { z } = require('zod');

const uuidSchema = z
  .string({ invalid_type_error: 'ID must be a string' })
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'ID must be a valid UUID');

// Strip control characters from free text before it is stored.
const text = (max) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .pipe(z.string().max(max));

const addressBody = z
  .object({
    title: text(50).optional(),
    region: z.string().trim().max(30).optional().nullable(),
    district: z.string({ required_error: 'District is required' }).trim().min(2, 'District is required').max(100),
    division: text(100).optional().nullable(),
    streetAddress: text(300).pipe(
      z.string().min(3, 'Enter the street, building or house details so the rider can find you')
    ),
    landmark: text(300).optional().nullable(),
    contactPhone: z.string({ required_error: 'A contact phone number is required' }).trim().min(9).max(20),
    latitude: z.coerce.number({ required_error: 'Pin your location on the map', invalid_type_error: 'Pin your location on the map' }),
    longitude: z.coerce.number({ required_error: 'Pin your location on the map', invalid_type_error: 'Pin your location on the map' }),
    isDefault: z.boolean().optional(),
    // Server-derived fields are never accepted from the client.
    isVerified: z.unknown().optional(),
    formattedAddress: z.unknown().optional(),
    userId: z.unknown().optional(),
  })
  .transform(({ isVerified, formattedAddress, userId, ...rest }) => rest);

const createAddressSchema = { body: addressBody };
const updateAddressSchema = { params: z.object({ id: uuidSchema }), body: addressBody };
const addressIdSchema = { params: z.object({ id: uuidSchema }) };

module.exports = { createAddressSchema, updateAddressSchema, addressIdSchema };
