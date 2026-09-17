const express = require('express');
const router = express.Router();

const adminAuthController = require('../controllers/adminAuth.controller');
const validateRequest = require('../middleware/requestValidator');
const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const { adminLoginSchema } = require('../validators/auth.validator');

// Admin login
router.post('/login', validateRequest(adminLoginSchema), adminAuthController.login);

// Authenticated admin profile
router.get('/me', authenticateAdmin, adminAuthController.getMe);

// Role-protected endpoints for authorization verification
router.get('/super-admin-only', authenticateAdmin, requireRole('SUPER_ADMIN'), (req, res) => {
  res.json({
    success: true,
    message: 'Welcome Super Admin',
    data: { admin: req.admin },
  });
});

router.get('/dispatcher-or-admin', authenticateAdmin, requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN'), (req, res) => {
  res.json({
    success: true,
    message: 'Authorized operations route',
    data: { admin: req.admin },
  });
});

module.exports = router;
