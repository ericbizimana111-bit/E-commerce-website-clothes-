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
  customerRegisterSchema,
  customerLoginSchema,
  adminLoginSchema,
  otpRequestSchema,
  otpVerifySchema,
};
