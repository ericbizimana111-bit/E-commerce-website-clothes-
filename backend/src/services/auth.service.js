const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { normalizeUgandaPhone } = require('../utils/phone');
const { signCustomerToken } = require('./token.service');
const { AppError } = require('../middleware/errorHandler');

/**
 * Customer Authentication Service
 */

async function registerUser({ fullName, phone, email, password }) {
  const phoneResult = normalizeUgandaPhone(phone);
  if (!phoneResult.isValid) {
    throw new AppError(phoneResult.error, 400);
  }
  const normalizedPhone = phoneResult.normalized;

  // Check if phone number already registered
  const existingPhone = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
  });
  if (existingPhone) {
    throw new AppError('A user with this phone number already exists', 409);
  }

  // Check if email already registered (if provided)
  const normalizedEmail = email && email.trim().length > 0 ? email.trim().toLowerCase() : null;
  if (normalizedEmail) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingEmail) {
      throw new AppError('A user with this email already exists', 409);
    }
  }

  // Hash password using 12 salt rounds
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  // Create user and initialize empty cart
  const user = await prisma.user.create({
    data: {
      fullName: fullName.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      passwordHash,
      cart: {
        create: {},
      },
    },
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

  const token = signCustomerToken(user);

  return {
    user,
    token,
  };
}

async function loginUser({ phone, password }) {
  const phoneResult = normalizeUgandaPhone(phone);
  if (!phoneResult.isValid) {
    // Generic error to prevent enumeration
    throw new AppError('Invalid phone number or password', 401);
  }
  const normalizedPhone = phoneResult.normalized;

  const user = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
  });

  // Generic credential error whether user doesn't exist or is inactive
  if (!user || !user.isActive) {
    throw new AppError('Invalid phone number or password', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError('Invalid phone number or password', 401);
  }

  // Never return passwordHash
  const safeUser = {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  const token = signCustomerToken(safeUser);

  return {
    user: safeUser,
    token,
  };
}

async function getUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id },
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

  return user;
}

module.exports = {
  registerUser,
  loginUser,
  getUserById,
};
