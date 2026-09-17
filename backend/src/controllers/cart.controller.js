const cartService = require('../services/cart.service');

async function getCart(req, res, next) {
  try {
    const data = await cartService.getCart(req.user.id, req.query.lang);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function addItem(req, res, next) {
  try {
    const data = await cartService.addItem(req.user.id, req.body, req.query.lang);
    res.status(201).json({
      success: true,
      message: 'Item added to cart successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function updateItem(req, res, next) {
  try {
    const data = await cartService.updateItem(req.user.id, req.params.itemId, req.body, req.query.lang);
    res.json({
      success: true,
      message: 'Cart item updated successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function removeItem(req, res, next) {
  try {
    const data = await cartService.removeItem(req.user.id, req.params.itemId, req.query.lang);
    res.json({
      success: true,
      message: 'Item removed from cart successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function clearCart(req, res, next) {
  try {
    const data = await cartService.clearCart(req.user.id, req.query.lang);
    res.json({
      success: true,
      message: 'Cart cleared successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};
