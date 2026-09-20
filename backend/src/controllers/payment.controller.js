const paymentService = require('../services/payment.service');
const { formatOrder } = require('../services/order.service');

// ---------- Customer endpoints ----------

// POST /api/orders/:id/payment — initiate commitment or balance payment
async function initiatePayment(req, res, next) {
  try {
    // Ownership + eligibility + authoritative amount are enforced in the service.
    // The body carries no financially meaningful fields (validator strips them).
    const purpose = req.body?.purpose;
    const result = await paymentService.initiatePayment(req.user.id, req.params.id, { purpose });

    const isBalance = result.payment.purpose === 'BALANCE';
    const prefix = isBalance ? 'Balance payment' : 'Commitment payment';

    const message = result.reused
      ? `${prefix} already completed for this order`
      : result.payment.status === 'PENDING'
        ? `${prefix} initiated. Awaiting provider verification.`
        : `${prefix} status: ${result.payment.status}`;

    res.status(200).json({
      success: true,
      message,
      data: {
        payment: paymentService.formatPayment(result.payment),
        order: formatOrder(result.order, req.body?.language || 'EN', { includeHistory: false }),
        reused: result.reused || undefined,
        balance: result.balance || undefined,
        // Phase 12 Step 2: provider-hosted confirmation/redirect URL when the
        // adapter returns one (e.g. Flutterwave UG mobile money). The frontend
        // only navigates; success is still decided server-side via webhook.
        checkoutUrl: result.initiation?.checkoutUrl || undefined,
      },
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/orders/:id/payment — safe lookup of own payment attempts & financial state
async function getOrderPayment(req, res, next) {
  try {
    const result = await paymentService.getCustomerOrderPayment(req.user.id, req.params.id);
    res.json({
      success: true,
      data: result,
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
        paymentPurpose: payment.purpose,
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
