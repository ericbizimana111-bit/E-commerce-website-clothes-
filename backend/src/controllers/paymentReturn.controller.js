const prisma = require('../config/db');
const env = require('../config/env');

/**
 * GET /api/payments/return
 *
 * Redirect relay for Flutterwave card-payment hosted checkout.
 * After the customer completes (or abandons) card payment on Flutterwave's
 * hosted page, Flutterwave redirects their browser here with:
 *   ?status=successful|cancelled|failed&tx_ref=PAY-…&transaction_id=…
 *
 * The webhook is the canonical payment-result channel. This handler does NOT
 * process the payment — it simply redirects the customer back to their order
 * page so they see the result (which the webhook has almost certainly already
 * applied by the time the browser redirect arrives).
 *
 * No customer JWT is required: this endpoint is reached via a browser redirect
 * from Flutterwave's hosted page, not an authenticated API call.
 */
async function handleReturn(req, res) {
  const { tx_ref } = req.query;

  let redirectTarget = `${env.FRONTEND_URL}/account/orders`;

  if (tx_ref && typeof tx_ref === 'string' && tx_ref.length <= 200) {
    try {
      const payment = await prisma.payment.findFirst({
        where: { transactionRef: tx_ref },
        select: { orderId: true },
      });
      if (payment?.orderId) {
        redirectTarget = `${env.FRONTEND_URL}/account/orders/${payment.orderId}`;
      }
    } catch {
      // Non-fatal: fall through to the orders-list redirect
    }
  }

  return res.redirect(302, redirectTarget);
}

module.exports = { handleReturn };
