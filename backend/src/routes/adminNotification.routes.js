const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const validateRequest = require('../middleware/requestValidator');
const notificationService = require('../services/notification.service');

// Every staff role sees the operational feed (orders, payments, messages,
// service bookings); read state is tracked per admin.
router.use(authenticateAdmin);
router.use(requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN'));

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid notification ID');

// GET /api/admin/notifications?page=&limit=&unread=true&type=NEW_ORDER
router.get('/', async (req, res, next) => {
  try {
    const data = await notificationService.listAdminNotifications(req.admin.id, {
      page: req.query.page,
      limit: req.query.limit,
      unreadOnly: req.query.unread === 'true',
      type: typeof req.query.type === 'string' && /^[A-Z_]{3,40}$/.test(req.query.type) ? req.query.type : null,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/notifications/unread-count
router.get('/unread-count', async (req, res, next) => {
  try {
    const unread = await notificationService.countUnreadAdmin(req.admin.id);
    res.json({ success: true, data: { unread } });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/notifications/read { ids: [...] }
router.patch(
  '/read',
  validateRequest({ body: z.object({ ids: z.array(uuid).min(1).max(200) }) }),
  async (req, res, next) => {
    try {
      const unread = await notificationService.markAdminRead(req.admin.id, req.body.ids);
      res.json({ success: true, data: { unread } });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/admin/notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    const unread = await notificationService.markAllAdminRead(req.admin.id);
    res.json({ success: true, data: { unread } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
