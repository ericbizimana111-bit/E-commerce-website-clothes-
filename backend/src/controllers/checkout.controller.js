const checkoutService = require('../services/checkout.service');

async function preview(req, res, next) {
  try {
    const data = await checkoutService.buildCheckoutPreview(req.user.id, req.body);
    res.json({
      success: true,
      message: 'Checkout preview calculated successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  preview,
};
