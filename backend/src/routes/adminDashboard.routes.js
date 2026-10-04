const express = require('express');
const prisma = require('../config/db');
const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const notificationService = require('../services/notification.service');

/**
 * GET /api/admin/dashboard/summary — one round trip for the console home:
 * today's activity, money collected, work queues and a 7-day trend.
 * "Today" is Kampala time (EAT, UTC+3, no daylight saving).
 */
const router = express.Router();
router.use(authenticateAdmin);
router.use(requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN'));

const EAT_OFFSET_MS = 3 * 3600 * 1000;
function startOfKampalaDay(daysAgo = 0) {
  const now = new Date(Date.now() + EAT_OFFSET_MS);
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - daysAgo * 86400000;
  return new Date(day - EAT_OFFSET_MS);
}

const ACTIVE_ORDER_STATUSES = ['COMMITMENT_PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'];

router.get('/summary', async (req, res, next) => {
  try {
    const today = startOfKampalaDay(0);
    const weekStart = startOfKampalaDay(6);

    const [
      ordersToday,
      revenueToday,
      paidToday,
      needsAction,
      awaitingPayment,
      activeDeliveries,
      openServiceRequests,
      newServiceRequests,
      unreadChats,
      lowStock,
      customersTotal,
      customersToday,
      weekOrders,
      unreadNotifications,
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: today } } }),
      prisma.order.aggregate({ where: { createdAt: { gte: today }, status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] } }, _sum: { totalAmount: true } }),
      prisma.payment.aggregate({ where: { status: 'SUCCESS', verifiedAt: { gte: today } }, _sum: { amountUgx: true } }),
      prisma.order.count({ where: { status: { in: ['COMMITMENT_PAID', 'CONFIRMED'] } } }),
      prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
      prisma.delivery.count({ where: { status: { in: ['ASSIGNED', 'READY', 'OUT_FOR_DELIVERY'] }, fulfillmentType: 'HOME_DELIVERY' } }),
      prisma.serviceRequest.count({ where: { status: { in: ['PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] } } }),
      prisma.serviceRequest.count({ where: { status: 'PENDING' } }),
      prisma.conversation.aggregate({ _sum: { adminUnread: true } }),
      prisma.product.count({ where: { isActive: true, stockQuantity: { lte: 5 } } }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.order.findMany({
        where: { createdAt: { gte: weekStart }, status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] } },
        select: { createdAt: true, totalAmount: true },
      }),
      notificationService.countUnreadAdmin(req.admin.id),
    ]);

    const trend = [];
    for (let i = 6; i >= 0; i -= 1) {
      const start = startOfKampalaDay(i);
      const end = new Date(start.getTime() + 86400000);
      const rows = weekOrders.filter((o) => o.createdAt >= start && o.createdAt < end);
      trend.push({
        date: new Date(start.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10),
        orders: rows.length,
        revenueUgx: rows.reduce((s, o) => s + o.totalAmount, 0),
      });
    }

    const activeOrders = await prisma.order.count({ where: { status: { in: ACTIVE_ORDER_STATUSES } } });

    res.json({
      success: true,
      data: {
        today: {
          orders: ordersToday,
          orderValueUgx: revenueToday._sum.totalAmount || 0,
          paymentsCollectedUgx: paidToday._sum.amountUgx || 0,
          newCustomers: customersToday,
        },
        queues: {
          ordersNeedingAction: needsAction,
          ordersAwaitingPayment: awaitingPayment,
          activeOrders,
          activeDeliveries,
          openServiceRequests,
          newServiceRequests,
          unreadMessages: unreadChats._sum.adminUnread || 0,
          lowStockProducts: lowStock,
          unreadNotifications,
        },
        customersTotal,
        trend,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
