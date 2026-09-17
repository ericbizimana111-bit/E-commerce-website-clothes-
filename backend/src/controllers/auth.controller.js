const authService = require('../services/auth.service');
const otpService = require('../services/otp.service');

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

module.exports = {
  register,
  login,
  requestOtp,
  verifyOtp,
  getMe,
};
