const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const validateRequest = require('../middleware/requestValidator');
const { authenticateCustomer } = require('../middleware/auth');
const {
  customerRegisterSchema,
  customerLoginSchema,
  otpRequestSchema,
  otpVerifySchema,
} = require('../validators/auth.validator');

// Customer registration
router.post('/register', validateRequest(customerRegisterSchema), authController.register);

// Customer login
router.post('/login', validateRequest(customerLoginSchema), authController.login);

// OTP request and verification endpoints
router.post('/otp/request', validateRequest(otpRequestSchema), authController.requestOtp);
router.post('/otp/verify', validateRequest(otpVerifySchema), authController.verifyOtp);

// Authenticated customer profile
router.get('/me', authenticateCustomer, authController.getMe);

module.exports = router;
