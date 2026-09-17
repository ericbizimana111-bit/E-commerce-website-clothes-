const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { signAdminToken } = require('./token.service');
const { AppError } = require('../middleware/errorHandler');

/**
 * Admin Authentication Service
 */

async function loginAdmin({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const admin = await prisma.admin.findUnique({
    where: { email: normalizedEmail },
  });

  // Generic credential error whether admin doesn't exist or is inactive
  if (!admin || !admin.isActive) {
    throw new AppError('Invalid email or password', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  // Never return passwordHash
  const safeAdmin = {
    id: admin.id,
    fullName: admin.fullName,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };

  const token = signAdminToken(safeAdmin);

  return {
    admin: safeAdmin,
    token,
  };
}

async function getAdminById(id) {
  const admin = await prisma.admin.findUnique({
    where: { id },
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

  return admin;
}

module.exports = {
  loginAdmin,
  getAdminById,
};
