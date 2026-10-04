const authService = require('../services/auth.service');
const otpService = require('../services/otp.service');
const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

async function register(req, res, next) {
  try {
    const result = await authService.registerUser(req.body);
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.loginUser(req.body);
    res.json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function requestOtp(req, res, next) {
  try {
    const result = await otpService.requestOtp(req.body.phone);
    res.json({
      success: true,
      message: result.message,
      expiresInSeconds: result.expiresInSeconds,
      ...(result.devCode && { devCode: result.devCode }),
    });
  } catch (error) {
    next(error);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const result = await otpService.verifyOtp(req.body.phone, req.body.code);
    res.json({
      success: true,
      message: 'Phone number verified successfully',
    });
  } catch (error) {
    next(error);
  }
}

async function getMe(req, res, next) {
  try {
    res.json({
      success: true,
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/auth/me — update own name/email (email is needed for mobile money)
async function updateMe(req, res, next) {
  try {
    const data = {};
    if (req.body.fullName !== undefined) data.fullName = req.body.fullName;
    if (req.body.email !== undefined) {
      if (req.body.email) {
        const taken = await prisma.user.findFirst({ where: { email: req.body.email, id: { not: req.user.id } }, select: { id: true } });
        if (taken) throw new AppError('This email is already used by another account', 409);
      }
      data.email = req.body.email;
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, fullName: true, phone: true, email: true, isActive: true, createdAt: true, updatedAt: true },
    });
    res.json({ success: true, message: 'Profile updated', data: { user } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  updateMe,
  register,
  login,
  requestOtp,
  verifyOtp,
  getMe,
};
