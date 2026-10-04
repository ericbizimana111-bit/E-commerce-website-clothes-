const prisma = require('../config/db');
const logger = require('../utils/logger');
const realtime = require('./realtime.service');

/**
 * Notifications for staff (shared feed, per-admin read state) and customers.
 * Every notification is persisted first (source of truth) and then pushed
 * live over SSE. Notification failures are logged and swallowed: they must
 * never roll back or fail the business operation that triggered them.
 */

const ADMIN_NOTIFICATION_TYPES = {
  NEW_ORDER: 'NEW_ORDER',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  BALANCE_PAID: 'BALANCE_PAID',
  NEW_MESSAGE: 'NEW_MESSAGE',
  NEW_SERVICE_REQUEST: 'NEW_SERVICE_REQUEST',
  SERVICE_REQUEST_CANCELLED: 'SERVICE_REQUEST_CANCELLED',
  LOW_STOCK: 'LOW_STOCK',
};

function formatAdminNotification(row, adminId) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    linkUrl: row.linkUrl,
    orderId: row.orderId,
    metadata: row.metadata || null,
    createdAt: row.createdAt,
    isRead: Array.isArray(row.reads) ? row.reads.some((r) => r.adminId === adminId) : false,
  };
}

/** Persist + broadcast a staff notification. Returns the row or null. */
async function notifyAdmins({ type, title, message, linkUrl = null, orderId = null, metadata = null }) {
  try {
    const row = await prisma.adminNotification.create({
      data: {
        type,
        title: String(title).slice(0, 150),
        message: String(message).slice(0, 2000),
        linkUrl,
        orderId,
        metadata: metadata || undefined,
      },
    });
    realtime.publish('admins', 'notification', formatAdminNotification({ ...row, reads: [] }));
    return row;
  } catch (error) {
    logger.error('[notify] admin notification failed:', error.message);
    return null;
  }
}

async function listAdminNotifications(adminId, { page = 1, limit = 20, unreadOnly = false, type = null } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const where = {};
  if (unreadOnly) where.reads = { none: { adminId } };
  if (type) where.type = String(type);

  const [total, rows, unread] = await Promise.all([
    prisma.adminNotification.count({ where }),
    prisma.adminNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: { reads: { where: { adminId }, select: { adminId: true } } },
    }),
    countUnreadAdmin(adminId),
  ]);
  return {
    items: rows.map((r) => formatAdminNotification(r, adminId)),
    unread,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

function countUnreadAdmin(adminId) {
  return prisma.adminNotification.count({ where: { reads: { none: { adminId } } } });
}

async function markAdminRead(adminId, ids) {
  const existing = await prisma.adminNotification.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (existing.length) {
    await prisma.adminNotificationRead.createMany({
      data: existing.map((n) => ({ notificationId: n.id, adminId })),
      skipDuplicates: true,
    });
  }
  return countUnreadAdmin(adminId);
}

async function markAllAdminRead(adminId) {
  const unread = await prisma.adminNotification.findMany({
    where: { reads: { none: { adminId } } },
    select: { id: true },
    take: 5000,
  });
  if (unread.length) {
    await prisma.adminNotificationRead.createMany({
      data: unread.map((n) => ({ notificationId: n.id, adminId })),
      skipDuplicates: true,
    });
  }
  return countUnreadAdmin(adminId);
}

// ------------------------------------------------------------
// Customers
// ------------------------------------------------------------
function formatCustomerNotification(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    linkUrl: n.linkUrl || null,
    isRead: n.isRead,
    createdAt: n.createdAt,
  };
}

/** Persist + push a customer notification. `client` may be a transaction. */
async function notifyCustomer(userId, { type = 'ORDER_UPDATE', title, message, linkUrl = null }, client = prisma) {
  try {
    const row = await client.notification.create({
      data: {
        userId,
        type,
        title: String(title).slice(0, 150),
        message: String(message).slice(0, 1000),
        linkUrl,
      },
    });
    // When called inside a transaction the push may precede commit by a few
    // ms; clients treat pushes as hints and refetch, so this is safe.
    realtime.publish(`user:${userId}`, 'notification', formatCustomerNotification(row));
    return row;
  } catch (error) {
    logger.error('[notify] customer notification failed:', error.message);
    if (client !== prisma) throw error; // inside a tx: let the caller decide
    return null;
  }
}

async function listCustomerNotifications(userId, { limit = 50 } = {}) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, parseInt(limit, 10) || 50)),
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { notifications: items.map(formatCustomerNotification), unread };
}

module.exports = {
  ADMIN_NOTIFICATION_TYPES,
  notifyAdmins,
  listAdminNotifications,
  countUnreadAdmin,
  markAdminRead,
  markAllAdminRead,
  notifyCustomer,
  listCustomerNotifications,
  formatCustomerNotification,
};
