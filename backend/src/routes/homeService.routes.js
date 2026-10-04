const express = require('express');
const { z } = require('zod');
const { authenticateCustomer } = require('../middleware/auth');
const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const validateRequest = require('../middleware/requestValidator');
const svc = require('../services/homeService.service');
const imageService = require('../services/image.service');
const { uploadProductImageMiddleware } = require('../config/upload');
const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid ID');
const intId = z.coerce.number().int().positive();
const lang = (req) => (typeof req.query.lang === 'string' && /^(en|lg|fr|sw)$/i.test(req.query.lang) ? req.query.lang : 'en');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// ------------------------------------------------------------
// Public catalogue: /api/services
// ------------------------------------------------------------
const publicRouter = express.Router();

publicRouter.get('/', wrap(async (req, res) => {
  res.json({ success: true, data: { services: await svc.listPublicServices(lang(req)), timeSlots: svc.TIME_SLOTS } });
}));

publicRouter.get('/:slug', validateRequest({ params: z.object({ slug: z.string().trim().min(1).max(120) }) }), wrap(async (req, res) => {
  res.json({ success: true, data: { service: await svc.getPublicService(req.params.slug, lang(req)) } });
}));

// ------------------------------------------------------------
// Customer bookings: /api/service-requests
// ------------------------------------------------------------
const customerRouter = express.Router();
customerRouter.use(authenticateCustomer);

const createRequestBody = z
  .object({
    serviceId: intId.optional(),
    serviceSlug: z.string().trim().max(120).optional(),
    addressId: uuid,
    description: z
      .string({ required_error: 'Describe what you need done' })
      .trim()
      .min(10, 'Please describe the problem in a few words (at least 10 characters)')
      .max(2000),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date'),
    preferredSlot: z.enum(['MORNING', 'AFTERNOON', 'EVENING'], { errorMap: () => ({ message: 'Choose a time slot' }) }),
    contactPhone: z.string().trim().max(20).optional().nullable(),
    // Server-decided fields are never accepted from the client.
    status: z.unknown().optional(),
    quotedPriceUgx: z.unknown().optional(),
    priceFromUgx: z.unknown().optional(),
    providerId: z.unknown().optional(),
  })
  .refine((b) => b.serviceId || b.serviceSlug, { message: 'Choose a service', path: ['serviceId'] })
  .transform(({ status, quotedPriceUgx, priceFromUgx, providerId, ...rest }) => rest);

customerRouter.post('/', validateRequest({ body: createRequestBody }), wrap(async (req, res) => {
  const request = await svc.createRequest(req.user.id, req.body);
  res.status(201).json({ success: true, message: 'Booking received', data: { request } });
}));

customerRouter.get('/', wrap(async (req, res) => {
  res.json({ success: true, data: { requests: await svc.listMyRequests(req.user.id, lang(req)) } });
}));

customerRouter.get('/:id', validateRequest({ params: z.object({ id: uuid }) }), wrap(async (req, res) => {
  res.json({ success: true, data: { request: await svc.getMyRequest(req.user.id, req.params.id, lang(req)) } });
}));

customerRouter.post(
  '/:id/cancel',
  validateRequest({ params: z.object({ id: uuid }), body: z.object({ reason: z.string().trim().max(500).optional() }) }),
  wrap(async (req, res) => {
    res.json({ success: true, data: { request: await svc.cancelMyRequest(req.user.id, req.params.id, req.body.reason) } });
  })
);

// ------------------------------------------------------------
// Staff: /api/admin/services
// ------------------------------------------------------------
const adminRouter = express.Router();
adminRouter.use(authenticateAdmin);

const ops = requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN');
const managers = requireRole('ADMIN', 'SUPER_ADMIN');

const serviceFields = {
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(3000).optional().nullable(),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens').optional(),
  icon: z.string().trim().max(50).regex(/^[a-z0-9-]*$/).optional().nullable(),
  priceType: z.enum(['FIXED', 'HOURLY', 'INSPECTION']).optional(),
  priceFromUgx: z.coerce.number().int().min(0).max(100000000).optional(),
  durationText: z.string().trim().max(60).optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
};

adminRouter.get('/catalog', ops, wrap(async (req, res) => {
  res.json({ success: true, data: { services: await svc.listAdminServices() } });
}));

adminRouter.post('/catalog', managers, validateRequest({ body: z.object(serviceFields) }), wrap(async (req, res) => {
  res.status(201).json({ success: true, data: { service: await svc.createService(req.body, req.admin.id, req.ip) } });
}));

adminRouter.put(
  '/catalog/:id',
  managers,
  validateRequest({ params: z.object({ id: intId }), body: z.object(serviceFields).partial() }),
  wrap(async (req, res) => {
    res.json({ success: true, data: { service: await svc.updateService(req.params.id, req.body, req.admin.id, req.ip) } });
  })
);

adminRouter.post(
  '/catalog/:id/image',
  managers,
  validateRequest({ params: z.object({ id: intId }) }),
  uploadProductImageMiddleware,
  wrap(async (req, res) => {
    const existing = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Service not found', 404);
    if (!req.file) throw new AppError('No image file received. Send multipart/form-data with an "image" field', 400);
    const url = imageService.saveImageFile(req.file.buffer, req.file.mimetype);
    const service = await svc.updateService(req.params.id, { imageUrl: url }, req.admin.id, req.ip);
    if (existing.imageUrl && existing.imageUrl !== url) await imageService.cleanupOrphanedImageFile(existing.imageUrl);
    res.json({ success: true, data: { service } });
  })
);

// Technicians
const providerFields = {
  fullName: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(9).max(20),
  coverage: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  serviceIds: z.array(intId).max(50).optional(),
};

adminRouter.get('/providers', ops, wrap(async (req, res) => {
  const serviceId = req.query.serviceId ? parseInt(req.query.serviceId, 10) || null : null;
  res.json({ success: true, data: { providers: await svc.listProviders({ serviceId, activeOnly: req.query.active === 'true' }) } });
}));

adminRouter.post('/providers', managers, validateRequest({ body: z.object(providerFields) }), wrap(async (req, res) => {
  res.status(201).json({ success: true, data: { provider: await svc.createProvider(req.body, req.admin.id, req.ip) } });
}));

adminRouter.put(
  '/providers/:id',
  managers,
  validateRequest({ params: z.object({ id: uuid }), body: z.object(providerFields).partial() }),
  wrap(async (req, res) => {
    res.json({ success: true, data: { provider: await svc.updateProvider(req.params.id, req.body, req.admin.id, req.ip) } });
  })
);

// Bookings
adminRouter.get('/requests', ops, wrap(async (req, res) => {
  const status = typeof req.query.status === 'string' && /^[A-Z_]+$/.test(req.query.status) ? req.query.status : null;
  const data = await svc.listAdminRequests({
    page: req.query.page,
    limit: req.query.limit,
    status,
    serviceId: req.query.serviceId,
    search: typeof req.query.search === 'string' ? req.query.search : null,
  });
  res.json({ success: true, data });
}));

adminRouter.get('/requests/:id', ops, validateRequest({ params: z.object({ id: uuid }) }), wrap(async (req, res) => {
  res.json({ success: true, data: { request: await svc.getAdminRequest(req.params.id) } });
}));

adminRouter.get('/requests/:id/route', ops, validateRequest({ params: z.object({ id: uuid }) }), wrap(async (req, res) => {
  res.json({ success: true, data: { route: await svc.getRequestRoute(req.params.id) } });
}));

adminRouter.patch(
  '/requests/:id',
  ops,
  validateRequest({
    params: z.object({ id: uuid }),
    body: z.object({
      status: z.enum(['PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
      providerId: uuid.nullable().optional(),
      quotedPriceUgx: z.coerce.number().int().min(0).max(100000000).nullable().optional(),
      scheduledAt: z.coerce.date().nullable().optional(),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  wrap(async (req, res) => {
    res.json({ success: true, data: { request: await svc.adminUpdateRequest(req.params.id, req.body, req.admin, req.ip) } });
  })
);

adminRouter.post(
  '/requests/:id/payment',
  ops,
  validateRequest({
    params: z.object({ id: uuid }),
    body: z.object({
      method: z.enum(['MTN_MOMO', 'AIRTEL_MONEY'], { errorMap: () => ({ message: 'Method must be MTN MoMo or Airtel Money' }) }),
      reference: z.string().trim().min(4, 'Enter the mobile money transaction ID').max(100),
      amountUgx: z.coerce.number().int().min(0).max(100000000).optional(),
    }),
  }),
  wrap(async (req, res) => {
    res.json({ success: true, data: { request: await svc.recordPayment(req.params.id, req.body, req.admin, req.ip) } });
  })
);

module.exports = { publicServiceRoutes: publicRouter, customerServiceRequestRoutes: customerRouter, adminServiceRoutes: adminRouter };
