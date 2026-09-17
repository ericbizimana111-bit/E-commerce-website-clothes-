const orderService = require('../services/order.service');

// ---------- Customer endpoints ----------

async function createOrder(req, res, next) {
  try {
    const { language, ...payload } = req.body;
    const order = await orderService.createOrderFromCart(req.user.id, payload);
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { order: orderService.formatOrder(order, language) },
    });
  } catch (error) {
    next(error);
  }
}

async function listOrders(req, res, next) {
  try {
    const { lang, ...query } = req.query;
    const result = await orderService.listCustomerOrders(req.user.id, query);
    res.json({
      success: true,
      ...result,
      // items already formatted with 'EN'; reformat cost is low but lang honored on detail
    });
  } catch (error) {
    next(error);
  }
}

async function getOrder(req, res, next) {
  try {
    const order = await orderService.getCustomerOrder(req.user.id, req.params.id, req.query.lang);
    res.json({
      success: true,
      data: { order },
    });
  } catch (error) {
    next(error);
  }
}

async function cancelOrder(req, res, next) {
  try {
    const order = await orderService.cancelCustomerOrder(req.user.id, req.params.id, req.body.reason);
    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: { order: orderService.formatOrder(order) },
    });
  } catch (error) {
    next(error);
  }
}

// ---------- Admin endpoints ----------

async function adminListOrders(req, res, next) {
  try {
    const result = await orderService.listAdminOrders(req.query);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

async function adminGetOrder(req, res, next) {
  try {
    const order = await orderService.getAdminOrder(req.params.id);
    res.json({
      success: true,
      data: { order },
    });
  } catch (error) {
    next(error);
  }
}

async function adminUpdateStatus(req, res, next) {
  try {
    const order = await orderService.adminUpdateOrderStatus({
      orderId: req.params.id,
      toStatus: req.body.status,
      reason: req.body.reason,
      admin: req.admin,
      ipAddress: req.ip,
    });
    res.json({
      success: true,
      message: `Order status updated to ${order.status}`,
      data: { order: orderService.formatOrder(order) },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  listOrders,
  getOrder,
  cancelOrder,
  adminListOrders,
  adminGetOrder,
  adminUpdateStatus,
};
