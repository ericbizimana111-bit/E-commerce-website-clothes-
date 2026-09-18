const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticateCustomer } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

router.use(authenticateCustomer);

// GET /api/notifications — list customer's notifications
router.get('/', async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        isRead: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: { notifications },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/:id/read — mark notification as read
router.patch('/:id/read', async (req, res, next) => {
  try {
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
      data: { notification: updated },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
