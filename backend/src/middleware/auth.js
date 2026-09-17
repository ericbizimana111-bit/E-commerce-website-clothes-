const { verifyCustomerToken } = require('../services/token.service');
const prisma = require('../config/db');
const { AppError } = require('./errorHandler');

/**
 * Customer Authentication Middleware
 * Expects: Authorization: Bearer <customer_jwt>
 */
async function authenticateCustomer(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication token required', 401);
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || !parts[1]) {
      throw new AppError('Malformed authorization header. Expected: Bearer <token>', 401);
    }

    const token = parts[1];
    const decoded = verifyCustomerToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new AppError('User not found or account is inactive', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  authenticateCustomer,
};
