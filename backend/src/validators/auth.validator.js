const { z } = require('zod');
const { normalizeUgandaPhone } = require('../utils/phone');

const ugandaPhoneSchema = z.string().refine((val) => {
  const result = normalizeUgandaPhone(val);
  return result.isValid;
}, {
  message: 'Invalid Uganda phone number format. Expected format: 07XXXXXXXX or +2567XXXXXXXX',
}).transform((val) => {
  const result = normalizeUgandaPhone(val);
  return result.normalized;
});

// PATCH /api/auth/me — profile fields a customer may change themselves.
// Phone is the login identity and is intentionally not editable here.
const updateProfileSchema = {
  body: z
    .object({
      fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(150).optional(),
      email: z
        .string()
        .trim()
        .email('Invalid email address')
        .max(255)
        .optional()
        .or(z.literal(''))
        .or(z.null())
        .transform((val) => (val === undefined ? undefined : val ? val.toLowerCase() : null)),
      phone: z.unknown().optional(),
      isActive: z.unknown().optional(),
      passwordHash: z.unknown().optional(),
    })
    .transform(({ fullName, email }) => ({ fullName, email })),
};

const customerRegisterSchema = {
  body: z.object({
    fullName: z
      .string({ required_error: 'Full name is required' })
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(150, 'Full name cannot exceed 150 characters'),
    phone: ugandaPhoneSchema,
    email: z
      .string()
      .trim()
      .email('Invalid email address')
      .optional()
      .or(z.literal(''))
      .transform((val) => (val && val.length > 0 ? val.toLowerCase() : null)),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters')
      .max(100, 'Password cannot exceed 100 characters'),
  }),
};

const customerLoginSchema = {
  body: z.object({
    phone: ugandaPhoneSchema,
    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required'),
  }),
};

const adminLoginSchema = {
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .email('Invalid email address')
      .toLowerCase(),
    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required'),
  }),
};

const otpRequestSchema = {
  body: z.object({
    phone: ugandaPhoneSchema,
  }),
};

const otpVerifySchema = {
  body: z.object({
    phone: ugandaPhoneSchema,
    code: z
      .string({ required_error: 'Verification code is required' })
      .regex(/^\d{6}$/, 'Verification code must be a 6-digit numeric code'),
  }),
};

module.exports = {
  updateProfileSchema,
  customerRegisterSchema,
  customerLoginSchema,
  adminLoginSchema,
  otpRequestSchema,
  otpVerifySchema,
};
