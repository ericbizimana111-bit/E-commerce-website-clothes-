const { z } = require('zod');

// Phones here may be mobiles or landlines, so this is a shape check only.
const PHONE_RE = /^\+?[0-9][0-9 ()-]{5,28}$/;

const name = z
  .string({ required_error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(150, 'Name cannot exceed 150 characters');
const district = z
  .string({ required_error: 'District is required' })
  .trim()
  .min(2, 'District must be at least 2 characters')
  .max(100, 'District cannot exceed 100 characters');
const addressText = z
  .string({ required_error: 'Address is required' })
  .trim()
  .min(3, 'Address must be at least 3 characters')
  .max(300, 'Address cannot exceed 300 characters');
const contactPhone = z
  .string({ required_error: 'Contact phone is required' })
  .trim()
  .max(30, 'Phone cannot exceed 30 characters')
  .regex(PHONE_RE, 'Enter a valid phone number, e.g. +256700123456');
const operatingHours = z
  .string({ required_error: 'Opening hours are required' })
  .trim()
  .min(3, 'Opening hours are required')
  .max(100, 'Opening hours cannot exceed 100 characters');
const pickupFeeUgx = z.coerce
  .number({ invalid_type_error: 'Pickup fee must be a number' })
  .int('Pickup fee must be a whole number of UGX')
  .min(0, 'Pickup fee cannot be negative')
  .max(1000000, 'Pickup fee is unreasonably high');
const latitude = z.coerce.number().min(-90).max(90).nullable().optional();
const longitude = z.coerce.number().min(-180).max(180).nullable().optional();

const idParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ invalid_type_error: 'ID must be a number' })
      .int('ID must be an integer')
      .positive('ID must be a positive integer'),
  }),
};

const createStationSchema = {
  body: z.object({
    name,
    district,
    addressText,
    contactPhone,
    operatingHours,
    pickupFeeUgx: pickupFeeUgx.optional().default(0),
    latitude,
    longitude,
    isActive: z.boolean().optional().default(true),
  }),
};

const updateStationSchema = {
  ...idParamSchema,
  body: z
    .object({
      name: name.optional(),
      district: district.optional(),
      addressText: addressText.optional(),
      contactPhone: contactPhone.optional(),
      operatingHours: operatingHours.optional(),
      pickupFeeUgx: pickupFeeUgx.optional(),
      latitude,
      longitude,
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' }),
};

const toggleStationActiveSchema = {
  ...idParamSchema,
  body: z.object({ isActive: z.boolean({ required_error: 'isActive is required' }) }),
};

module.exports = { idParamSchema, createStationSchema, updateStationSchema, toggleStationActiveSchema };
