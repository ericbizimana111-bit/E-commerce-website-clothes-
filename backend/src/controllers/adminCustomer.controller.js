const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { formatOrder } = require('../services/order.service');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function safeInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function formatCustomer(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email || null,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    orderCount: user._count?.orders ?? undefined,
  };
}

// GET /api/admin/customers
async function listCustomers(req, res, next) {
  try {
    const pageNum = Math.max(1, safeInt(req.query.page, 1));
    const limitNum = Math.min(MAX_LIMIT, safeInt(req.query.limit, DEFAULT_LIMIT));
    const skip = (pageNum - 1) * limitNum;
    const search = req.query.search ? String(req.query.search).trim() : null;

    const where = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      items: users.map(formatCustomer),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/customers/:id
async function getCustomer(req, res, next) {
  try {
    const pageNum = Math.max(1, safeInt(req.query.page, 1));
    const limitNum = Math.min(50, safeInt(req.query.limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    });

    if (!user) throw new AppError('Customer not found', 404);

    const [orderTotal, orders] = await Promise.all([
      prisma.order.count({ where: { userId: req.params.id } }),
      prisma.order.findMany({
        where: { userId: req.params.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: { items: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        customer: formatCustomer(user),
        orders: orders.map((o) => formatOrder(o, 'EN', { includeHistory: false })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: orderTotal,
          totalPages: Math.ceil(orderTotal / limitNum),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listCustomers, getCustomer };
