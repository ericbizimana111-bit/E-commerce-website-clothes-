const adminAuthService = require('../services/adminAuth.service');

async function login(req, res, next) {
  try {
    const result = await adminAuthService.loginAdmin(req.body);
    res.json({
      success: true,
      message: 'Admin login successful',
      data: result,
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
        admin: req.admin,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  getMe,
};
