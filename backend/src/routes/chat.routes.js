const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { z } = require('zod');
const { authenticateCustomer } = require('../middleware/auth');
const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const validateRequest = require('../middleware/requestValidator');
const chatService = require('../services/chat.service');

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid ID');

const messageBody = z.object({
  body: z.string({ required_error: 'Message is required' }).max(chatService.MAX_BODY + 200),
  orderId: uuid.optional().nullable(),
  serviceRequestId: uuid.optional().nullable(),
});

// Anti-spam: per-sender message rate (keyed by identity, not IP).
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `u:${req.user.id}` : req.admin ? `a:${req.admin.id}` : ipKeyGenerator(req.ip)),
  message: { success: false, message: 'You are sending messages too quickly. Please wait a moment.' },
});

// ------------------------------------------------------------
// Customer: /api/chat
// ------------------------------------------------------------
const customer = express.Router();
customer.use(authenticateCustomer);

customer.get('/', async (req, res, next) => {
  try {
    const data = await chatService.getCustomerThread(req.user.id, { before: req.query.before, limit: req.query.limit });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

customer.get('/unread-count', async (req, res, next) => {
  try {
    res.json({ success: true, data: { unread: await chatService.customerUnreadCount(req.user.id) } });
  } catch (error) {
    next(error);
  }
});

customer.post('/messages', sendLimiter, validateRequest({ body: messageBody }), async (req, res, next) => {
  try {
    const message = await chatService.sendCustomerMessage(req.user.id, req.body);
    res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    next(error);
  }
});

customer.post('/read', async (req, res, next) => {
  try {
    res.json({ success: true, data: await chatService.markCustomerRead(req.user.id) });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------
// Staff: /api/admin/chat
// ------------------------------------------------------------
const admin = express.Router();
admin.use(authenticateAdmin);
admin.use(requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN'));

admin.get('/conversations', async (req, res, next) => {
  try {
    const data = await chatService.listConversations({
      page: req.query.page,
      limit: req.query.limit,
      search: typeof req.query.search === 'string' ? req.query.search : null,
      unreadOnly: req.query.unread === 'true',
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

admin.post('/conversations', validateRequest({ body: z.object({ userId: uuid }) }), async (req, res, next) => {
  try {
    const conversation = await chatService.openConversationWithCustomer(req.body.userId);
    res.json({ success: true, data: { conversation } });
  } catch (error) {
    next(error);
  }
});

admin.get('/conversations/:id', validateRequest({ params: z.object({ id: uuid }) }), async (req, res, next) => {
  try {
    const data = await chatService.getConversationForAdmin(req.params.id, { before: req.query.before, limit: req.query.limit });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

admin.post(
  '/conversations/:id/messages',
  sendLimiter,
  validateRequest({ params: z.object({ id: uuid }), body: messageBody }),
  async (req, res, next) => {
    try {
      const message = await chatService.sendAdminMessage(req.admin, req.params.id, req.body);
      res.status(201).json({ success: true, data: { message } });
    } catch (error) {
      next(error);
    }
  }
);

admin.post('/conversations/:id/read', validateRequest({ params: z.object({ id: uuid }) }), async (req, res, next) => {
  try {
    res.json({ success: true, data: await chatService.markAdminRead(req.params.id) });
  } catch (error) {
    next(error);
  }
});

module.exports = { customerChatRoutes: customer, adminChatRoutes: admin };
