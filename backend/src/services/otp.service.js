const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * OTP Provider Abstraction Interface
 * Plug in Twilio / Africa's Talking / Infobip here in the future without changing business logic.
 */
class MockOtpProvider {
  async sendOtp(phone, code) {
    if (env.NODE_ENV !== 'production') {
      logger.info(`[MOCK OTP PROVIDER] Verification code for ${phone}: ${code}`);
    }
    return { success: true, provider: 'MOCK' };
  }
}

const otpProvider = new MockOtpProvider();

/**
 * Generate a cryptographically random 6-digit OTP, hash it, and store in database
 */
async function requestOtp(phone) {
  // Generate random 6-digit code
  const code = crypto.randomInt(100000, 999999).toString();

  // Hash code using bcrypt (10 rounds) - never store plaintext OTP
  const salt = await bcrypt.genSalt(10);
  const codeHash = await bcrypt.hash(code, salt);

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes lifetime

  // Invalidate any previous unconsumed OTPs for this phone
  await prisma.otpCode.updateMany({
    where: {
      phone,
      consumed: false,
    },
    data: {
      consumed: true,
    },
  });

  // Save new OTP record
  await prisma.otpCode.create({
    data: {
      phone,
      codeHash,
      expiresAt,
      consumed: false,
    },
  });

  // Deliver via provider
  await otpProvider.sendOtp(phone, code);

  return {
    success: true,
    message: 'Verification code sent successfully',
    expiresInSeconds: 300,
    ...(env.NODE_ENV !== 'production' && { devCode: code }),
  };
}

/**
 * Verify provided OTP against stored hash
 */
async function verifyOtp(phone, code) {
  if (!code || typeof code !== 'string') {
    throw new AppError('Verification code is required', 400);
  }

  const now = new Date();

  // Find latest active OTP for this phone
  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      phone,
      consumed: false,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!otpRecord) {
    throw new AppError('Invalid or expired verification code', 400);
  }

  // Compare submitted code with hashed code
  const isMatch = await bcrypt.compare(code, otpRecord.codeHash);
  if (!isMatch) {
    throw new AppError('Invalid verification code', 400);
  }

  // Mark as consumed to prevent replay attacks
  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { consumed: true },
  });

  return { success: true };
}

module.exports = {
  requestOtp,
  verifyOtp,
  MockOtpProvider,
};
