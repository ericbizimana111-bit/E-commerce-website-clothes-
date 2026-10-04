const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticateCustomer } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const notificationService = require('../services/notification.service');

router.use(authenticateCustomer);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/notifications — latest notifications + unread count
router.get('/', async (req, res, next) => {
  try {
    const data = await notificationService.listCustomerNotifications(req.user.id, { limit: req.query.limit });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res, next) => {
  try {
    const unread = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });
    res.json({ success: true, data: { unread } });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
    res.json({ success: true, data: { unread: 0 } });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/:id/read — mark notification as read
router.patch('/:id/read', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw new AppError('Notification not found', 404);
    const notif = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!notif) {
      throw new AppError('Notification not found', 404);
    }
    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json({
      success: true,
      data: { notification: notificationService.formatCustomerNotification(updated) },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
