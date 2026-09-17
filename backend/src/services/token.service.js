const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AppError } = require('../middleware/errorHandler');

/**
 * Token Service
 * Completely partitions Customer and Admin authentication contexts using separate secrets.
 */

function signCustomerToken(user) {
  const payload = {
    sub: user.id,
    phone: user.phone,
    role: 'CUSTOMER',
    type: 'CUSTOMER_AUTH',
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

function verifyCustomerToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (decoded.type !== 'CUSTOMER_AUTH') {
      throw new AppError('Invalid token context', 401);
    }
    return decoded;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Authentication token has expired. Please login again.', 401);
    }
    throw new AppError('Invalid authentication token', 401);
  }
}

function signAdminToken(admin) {
  const payload = {
    sub: admin.id,
    email: admin.email,
    role: admin.role,
    type: 'ADMIN_AUTH',
  };

  return jwt.sign(payload, env.ADMIN_JWT_SECRET, {
    expiresIn: env.ADMIN_JWT_EXPIRES_IN,
  });
}

function verifyAdminToken(token) {
  try {
    const decoded = jwt.verify(token, env.ADMIN_JWT_SECRET);
    if (decoded.type !== 'ADMIN_AUTH') {
      throw new AppError('Invalid admin token context', 401);
    }
    return decoded;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Admin authentication token has expired. Please login again.', 401);
    }
    throw new AppError('Invalid admin authentication token', 401);
  }
}

module.exports = {
  signCustomerToken,
  verifyCustomerToken,
  signAdminToken,
  verifyAdminToken,
};
