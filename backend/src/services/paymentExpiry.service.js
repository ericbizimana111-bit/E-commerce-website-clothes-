/**
 * Payment expiration (Phase 6).
 *
 * Service-based, lazy expiration: active (PENDING/PROCESSING) payment attempts
 * whose expiresAt has passed are marked EXPIRED the next time payment
 * machinery runs (initiation or webhook processing). No scheduler/worker is
 * introduced in this phase — an expired attempt can never be verified to
 * SUCCESS afterwards because both initiate and webhook paths sweep first and
 * the webhook processor rejects EXPIRED/CANCELLED attempts (§23).
 *
 * Future operational requirement (documented, not built here): if attempt
 * volumes grow, a periodic job can call applyPaymentExpiration(prisma) on a
 * schedule. The logic intentionally stays in one place.
 */

const EXPIRABLE_STATUSES = ['PENDING', 'PROCESSING'];

/**
 * Expire overdue active payment attempts using the given client (tx or prisma).
 * Returns the number of attempts expired.
 */
async function applyPaymentExpiration(tx) {
  const result = await tx.payment.updateMany({
    where: {
      status: { in: EXPIRABLE_STATUSES },
      expiresAt: { not: null, lt: new Date() },
    },
    data: {
      status: 'EXPIRED',
      resultCode: 'TIMEOUT',
      failureMessage: 'Payment attempt expired before verification',
    },
  });
  return result.count;
}

module.exports = {
  EXPIRABLE_STATUSES,
  applyPaymentExpiration,
};
