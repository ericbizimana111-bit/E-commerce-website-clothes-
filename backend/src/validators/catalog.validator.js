const { z } = require('zod');

const languageEnum = z.enum(['EN', 'LG', 'FR', 'SW', 'en', 'lg', 'fr', 'sw']);

// Strict language query validation: never silently accept arbitrary language strings.
const languageQuerySchema = z
  .string({ invalid_type_error: 'lang must be a string' })
  .trim()
  .regex(/^(en|lg|fr|sw)$/i, 'Unsupported language. Supported languages: en, lg, fr, sw');

// Shared numeric route parameter validation (prevents Prisma NaN/500 errors)
const idParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ invalid_type_error: 'ID must be a number' })
      .int('ID must be an integer')
      .positive('ID must be a positive integer'),
  }),
};

const slugParamSchema = {
  params: z.object({
    slug: z
      .string({ required_error: 'slug is required' })
      .trim()
      .min(1, 'slug cannot be empty')
      .max(200),
  }),
};

const imageIdParamSchema = {
  params: z.object({
    id: z.coerce
      .number({ invalid_type_error: 'ID must be a number' })
      .int('ID must be an integer')
      .positive('ID must be a positive integer'),
    imageId: z.coerce
      .number({ invalid_type_error: 'Image ID must be a number' })
      .int('Image ID must be an integer')
      .positive('Image ID must be a positive integer'),
  }),
};

const translationItemSchema = z.object({
  language: languageEnum,
  name: z.string({ required_error: 'Translation name is required' }).trim().min(1, 'Name cannot be empty').max(200),
  description: z.string().trim().optional().or(z.literal('')).nullable(),
});

// Image URL security: only https/http URLs or safe app-relative /images/ paths.
// Blocks file://, javascript:, filesystem paths, and ../ traversal attempts.
const safeImageUrlSchema = z
  .string({ required_error: 'Image URL is required' })
  .trim()
  .min(1, 'Image URL cannot be empty')
  .max(2048, 'Image URL is too long')
  .refine(
    (url) => {
      if (/\\|\.\./.test(url)) return false; // block backslashes and traversal
      if (url.startsWith('/images/')) return url.length > '/images/'.length && !url.includes('..');
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        return false;
      }
    },
    'Image URL must be an absolute http(s) URL or a relative /images/ path (no traversal)'
  );

const imageItemSchema = z.object({
  imageUrl: safeImageUrlSchema,
  altText: z.string().trim().max(255).optional().or(z.literal('')).nullable(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
});

// Optional variant for category.imageUrl: empty/null is allowed, but a
// provided value must still be a safe http(s) URL or /images/ app path.
const optionalSafeImageUrlSchema = z
  .union([z.string(), z.null()])
  .optional()
  .refine(
    (val) => val === undefined || val === null || val === '' || safeImageUrlSchema.safeParse(val).success,
    'Image URL must be an absolute http(s) URL or a relative /images/ path (no traversal)'
  );

// Category Validators
const createCategorySchema = {
  body: z.object({
    slug: z
      .string({ required_error: 'Slug is required' })
      .trim()
      .min(2, 'Slug must be at least 2 characters')
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens (e.g. fresh-produce)'),
    displayOrder: z.coerce.number().int().min(0).optional().default(0),
    imageUrl: optionalSafeImageUrlSchema,
    isActive: z.boolean().optional().default(true),
    translations: z
      .array(translationItemSchema)
      .min(1, 'At least one translation is required')
      .refine(
        (items) => new Set(items.map((i) => i.language.toUpperCase())).size === items.length,
        'Duplicate translation languages are not allowed'
      ),
  }),
};

const updateCategorySchema = {
  body: z.object({
    slug: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
      .optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    imageUrl: optionalSafeImageUrlSchema,
    isActive: z.boolean().optional(),
    translations: z
      .array(translationItemSchema)
      .optional()
      .refine(
        (items) => !items || new Set(items.map((i) => i.language.toUpperCase())).size === items.length,
        'Duplicate translation languages are not allowed'
      ),
  }),
};

const toggleCategoryActiveSchema = {
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive boolean flag is required' }),
  }),
};

// Product Validators
const createProductSchema = {
  body: z.object({
    categoryId: z.coerce.number({ required_error: 'categoryId is required' }).int().positive(),
    slug: z
      .string({ required_error: 'Slug is required' })
      .trim()
      .min(2)
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens (e.g. fresh-green-matooke)'),
    sku: z.string().trim().max(50).optional().nullable(),
    priceUgx: z.coerce
      .number({ required_error: 'priceUgx is required' })
      .int('Price must be an integer (UGX)')
      .min(0, 'Price cannot be negative'),
    stockQuantity: z.coerce
      .number()
      .int('Stock quantity must be an integer')
      .min(0, 'Initial stock cannot be negative')
      .optional()
      .default(0),
    unit: z.string().trim().max(50).optional().default('piece'),
    isActive: z.boolean().optional().default(true),
    translations: z
      .array(translationItemSchema)
      .min(1, 'At least one translation is required')
      .refine(
        (items) => new Set(items.map((i) => i.language.toUpperCase())).size === items.length,
        'Duplicate translation languages are not allowed'
      ),
    images: z.array(imageItemSchema).optional().default([]),
  }),
};

const updateProductSchema = {
  body: z.object({
    categoryId: z.coerce.number().int().positive().optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
      .optional(),
    sku: z.string().trim().max(50).optional().nullable(),
    priceUgx: z.coerce
      .number()
      .int('Price must be an integer (UGX)')
      .min(0, 'Price cannot be negative')
      .optional(),
    unit: z.string().trim().max(50).optional(),
    isActive: z.boolean().optional(),
    translations: z
      .array(translationItemSchema)
      .optional()
      .refine(
        (items) => !items || new Set(items.map((i) => i.language.toUpperCase())).size === items.length,
        'Duplicate translation languages are not allowed'
      ),
  }),
};

const toggleProductActiveSchema = {
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive boolean flag is required' }),
  }),
};

const setProductImagesSchema = {
  body: z.object({
    images: z.array(imageItemSchema),
  }),
};

// Inventory Validators
const restockInventorySchema = {
  body: z.object({
    quantity: z.coerce
      .number({ required_error: 'Quantity is required' })
      .int('Quantity must be an integer')
      .positive('Restock quantity must be greater than 0'),
    reason: z.string().trim().max(255).optional(),
    referenceId: z.string().trim().max(100).optional().nullable(),
  }),
};

const adjustInventorySchema = {
  body: z.object({
    quantityChange: z.coerce
      .number({ required_error: 'quantityChange is required' })
      .int('quantityChange must be an integer')
      .refine((val) => val !== 0, 'quantityChange cannot be zero'),
    reason: z.string().trim().max(255).optional(),
    referenceId: z.string().trim().max(100).optional().nullable(),
  }),
};

// Query Parameter Validators
const publicProductQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100, 'Page limit cannot exceed 100').optional().default(20),
    categoryId: z.coerce.number().int().optional(),
    categorySlug: z.string().trim().optional(),
    inStock: z
      .enum(['true', 'false'])
      .optional()
      .transform((val) => (val === undefined ? undefined : val === 'true')),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    search: z.string().trim().max(100, 'Search term is too long').optional(),
    lang: languageQuerySchema.optional().default('en'),
  }),
};

const publicCategoryQuerySchema = {
  query: z.object({
    lang: languageQuerySchema.optional().default('en'),
  }),
};

module.exports = {
  idParamSchema,
  slugParamSchema,
  imageIdParamSchema,
  createCategorySchema,
  updateCategorySchema,
  toggleCategoryActiveSchema,
  createProductSchema,
  updateProductSchema,
  toggleProductActiveSchema,
  setProductImagesSchema,
  restockInventorySchema,
  adjustInventorySchema,
  publicProductQuerySchema,
  publicCategoryQuerySchema,
};
