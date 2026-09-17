const paymentService = require('../services/payment.service');
const { formatOrder } = require('../services/order.service');

// ---------- Customer endpoints ----------

// POST /api/orders/:id/payment — initiate the commitment payment
async function initiatePayment(req, res, next) {
  try {
    // Ownership + eligibility + authoritative amount are enforced in the service.
    // The body carries no financially meaningful fields (validator strips them).
    const result = await paymentService.initiateCommitmentPayment(req.user.id, req.params.id);
    res.status(200).json({
      success: true,
      message: result.reused
        ? 'Commitment payment already completed for this order'
        : result.payment.status === 'PENDING'
          ? 'Commitment payment initiated. Awaiting provider verification.'
          : `Commitment payment status: ${result.payment.status}`,
      data: {
        payment: paymentService.formatPayment(result.payment),
        order: formatOrder(result.order, req.body?.language || 'EN', { includeHistory: false }),
        reused: result.reused || undefined,
      },
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/orders/:id/payment — safe lookup of own payment attempts
async function getOrderPayment(req, res, next) {
  try {
    const result = await paymentService.getCustomerOrderPayment(req.user.id, req.params.id);
    res.json({
      success: true,
      data: {
        orderId: req.params.id,
        payments: result.payments,
        activePayment: result.activePayment,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------- Provider webhook (unauthenticated; signature-verified) ----------

// POST /api/payments/webhook — raw body is required for HMAC verification
async function paymentWebhook(req, res, next) {
  try {
    const result = await paymentService.processWebhook(req.rawBody, req.headers);
    const { payment, order, duplicate, ignored, failed, verified } = result;
    res.status(200).json({
      success: true,
      event: duplicate ? 'ALREADY_PROCESSED' : ignored ? 'IGNORED' : verified ? 'PAYMENT_APPLIED' : 'PAYMENT_FAILED_RECORDED',
      data: {
        paymentId: payment.id,
        paymentStatus: payment.status,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------- Admin (read-only) ----------

async function adminGetOrderPayment(req, res, next) {
  try {
    const result = await paymentService.getAdminOrderPayment(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  initiatePayment,
  getOrderPayment,
  paymentWebhook,
  adminGetOrderPayment,
};
