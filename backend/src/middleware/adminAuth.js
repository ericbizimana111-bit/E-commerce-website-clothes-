const { verifyAdminToken } = require('../services/token.service');
const prisma = require('../config/db');
const { AppError } = require('./errorHandler');

/**
 * Admin Authentication Middleware
 * Expects: Authorization: Bearer <admin_jwt>
 */
async function authenticateAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Admin authentication token required', 401);
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || !parts[1]) {
      throw new AppError('Malformed authorization header. Expected: Bearer <token>', 401);
    }

    const token = parts[1];
    const decoded = verifyAdminToken(token);

    const admin = await prisma.admin.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!admin || !admin.isActive) {
      throw new AppError('Admin account not found or is inactive', 401);
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Role-Based Access Control (RBAC) Middleware
 * Usage examples:
 *   requireRole('SUPER_ADMIN')
 *   requireRole('ADMIN', 'SUPER_ADMIN')
 *   requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return next(new AppError('Admin authentication required', 401));
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.admin.role)) {
      return next(new AppError('Forbidden: Insufficient role permissions', 403));
    }

    next();
  };
}

// Convenience helper requiring any active admin
const requireAdmin = requireRole();

module.exports = {
  authenticateAdmin,
  requireRole,
  requireAdmin,
};
