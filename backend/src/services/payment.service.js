const crypto = require('crypto');
const prisma = require('../config/db');
const env = require('../config/env');
const { AppError } = require('../middleware/errorHandler');
const { getPaymentProvider } = require('./paymentProviders');
const { applyPaymentExpiration } = require('./paymentExpiry.service');
const { applyOrderStatusTransition } = require('./order.service');
const { logAudit } = require('./audit.service');

const PAYMENT_ATTEMPT_TTL_MINUTES = env.PAYMENT_ATTEMPT_TTL_MINUTES || 30;
const CURRENCY = 'UGX';

// ============================================================
// Safe payment projection — NEVER exposes raw payloads/secrets
// ============================================================
function formatPayment(payment) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    purpose: payment.purpose,
    provider: payment.provider,
    transactionRef: payment.transactionRef,
    providerRef: payment.providerRef || null,
    amountUgx: payment.amountUgx,
    currency: payment.currency,
    status: payment.status,
    resultCode: payment.resultCode,
    failureMessage: payment.failureMessage || null,
    expiresAt: payment.expiresAt,
    verifiedAt: payment.verifiedAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

function assertProviderAllowed(provider) {
  if (env.NODE_ENV === 'production' && !provider.isProduction) {
    // Hard guard: production must never run on a fake/sandbox provider
    throw new AppError('Mock payment provider is disabled in production', 403);
  }
}

// ============================================================
// PAYMENT INITIATION (idempotent, server-authoritative amount)
// ============================================================
async function initiateCommitmentPayment(userId, orderId) {
  const provider = getPaymentProvider(env.PAYMENT_PROVIDER);
  assertProviderAllowed(provider);

  return prisma.$transaction(async (tx) => {
    // 1. Lazy expiry sweep
    await applyPaymentExpiration(tx);

    // 2. Order must exist and belong to this customer (ownership from JWT identity)
    const order = await tx.order.findFirst({
      where: { id: orderId, userId }, // IDOR-safe
      include: { items: true },
    });
    if (!order) {
      throw new AppError('Order not found', 404);
    }
    if (order.currency !== CURRENCY) {
      throw new AppError(`Order currency ${order.currency} is not supported`, 422);
    }

    // 3. Eligibility: exactly the Phase 5 state that may become COMMITMENT_PAID
    if (order.status !== 'PENDING_PAYMENT') {
      // Already paid (COMMITMENT_PAID or beyond): report the existing payment
      const existingSuccess = await tx.payment.findFirst({
        where: { orderId: order.id, purpose: 'COMMITMENT', status: 'SUCCESS' },
        orderBy: { verifiedAt: 'desc' },
      });
      if (existingSuccess) {
        return { payment: existingSuccess, order, reused: true };
      }
      throw new AppError(`Order is not eligible for payment in status ${order.status}`, 409);
    }

    // 4. Idempotent attempt reuse — one active attempt per order+purpose.
    //    Scope locked under the order row to make concurrent initiations safe.
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;

    const reusableStatuses = ['PENDING', 'PROCESSING'];
    let attempt = await tx.payment.findFirst({
      where: { orderId: order.id, purpose: 'COMMITMENT', status: { in: reusableStatuses } },
      orderBy: { createdAt: 'desc' },
    });

    const authoritativeAmount = order.commitmentAmount; // NEVER from the client

    if (!attempt) {
      attempt = await tx.payment.create({
        data: {
          orderId: order.id,
          purpose: 'COMMITMENT',
          paymentType: 'COMMITMENT_ONLINE',
          provider: provider.name,
          transactionRef: `PAY-${crypto.randomUUID()}`,
          amountUgx: authoritativeAmount,
          currency: CURRENCY,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + PAYMENT_ATTEMPT_TTL_MINUTES * 60 * 1000),
        },
      });
    } else if (attempt.amountUgx !== authoritativeAmount) {
      // Stale attempt (e.g. commitment rules changed): expire it and start fresh
      await tx.payment.update({
        where: { id: attempt.id },
        data: { status: 'EXPIRED', resultCode: 'TIMEOUT', failureMessage: 'Superseded by a new attempt' },
      });
      attempt = await tx.payment.create({
        data: {
          orderId: order.id,
          purpose: 'COMMITMENT',
          paymentType: 'COMMITMENT_ONLINE',
          provider: provider.name,
          transactionRef: `PAY-${crypto.randomUUID()}`,
          amountUgx: authoritativeAmount,
          currency: CURRENCY,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + PAYMENT_ATTEMPT_TTL_MINUTES * 60 * 1000),
        },
      });
    }

    // 5. Ask the provider to initiate/refresh the charge (attempt stays PENDING:
    //    "initiated" ≠ "paid" — only verification may transition the order)
    const result = provider.initiatePayment({ payment: attempt });
    attempt = await tx.payment.update({
      where: { id: attempt.id },
      data: { providerRef: result.providerRef },
    });

    await logAudit({
      action: 'PAYMENT_INITIATED',
      entityName: 'Payment',
      entityId: attempt.id,
      details: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        provider: provider.name,
        providerRef: result.providerRef,
        amountUgx: attempt.amountUgx,
        currency: attempt.currency,
      },
    });

    return { payment: attempt, order, reused: false };
  });
}

// ============================================================
// WEBHOOK PROCESSING (secure, transactional, idempotent)
// The ONLY path that may move PENDING_PAYMENT → COMMITMENT_PAID.
// ============================================================
async function processWebhook(rawBody, headers) {
  const provider = getPaymentProvider(env.PAYMENT_PROVIDER);
  assertProviderAllowed(provider);

  // 1. Signature verification + normalization (provider is the boundary)
  const verification = provider.verifyWebhook({ rawBody, headers });
  if (!verification.ok) {
    await logAudit({
      action: 'PAYMENT_WEBHOOK_REJECTED',
      entityName: 'Payment',
      entityId: 'unknown',
      details: { provider: provider.name, reason: verification.reason },
    });
    throw new AppError('Webhook verification failed', 400);
  }
  const event = verification.event;

  const postCommitAudits = [];
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    // 2. Lazy expiry sweep (an expired attempt can never be verified)
    await applyPaymentExpiration(tx);

    // 3. Correlate the provider event with our internal payment attempt
    const payment = await tx.payment.findFirst({
      where: { provider: provider.name, providerRef: event.providerRef },
      include: { order: true },
    });
    if (!payment) {
      const err = new AppError('Unknown payment reference', 404);
      err.rejectionAudit = {
        action: 'PAYMENT_WEBHOOK_REJECTED',
        entityName: 'Payment',
        entityId: 'unknown',
        details: { provider: provider.name, providerRef: event.providerRef, reason: 'UNKNOWN_PAYMENT' },
      };
      throw err;
    }

    // 4. Validate the event against the AUTHORITATIVE internal state.
    //    Rejections attach an audit payload that is written AFTER rollback.
    const reject = (message, statusCode, reason, extra = {}) => {
      const err = new AppError(message, statusCode);
      err.rejectionAudit = {
        action: 'PAYMENT_WEBHOOK_REJECTED',
        entityName: 'Payment',
        entityId: payment.id,
        details: { provider: provider.name, providerRef: event.providerRef, reason, ...extra },
      };
      return err;
    };
    if (payment.order.orderNumber !== event.orderNumber) {
      throw reject('Webhook order reference mismatch', 422, 'ORDER_MISMATCH');
    }
    if (payment.order.currency !== event.currency || event.currency !== CURRENCY) {
      throw reject('Webhook currency mismatch', 422, 'CURRENCY_MISMATCH');
    }
    if (payment.amountUgx !== event.amountUgx) {
      throw reject('Webhook amount mismatch', 422, 'AMOUNT_MISMATCH');
    }
    if (payment.purpose !== 'COMMITMENT') {
      throw reject('Unexpected payment purpose', 422, 'WRONG_PURPOSE');
    }

    // 5. Idempotency / state guards
    if (payment.status === 'SUCCESS') {
      // Duplicate delivery of an already-processed success: acknowledge, change nothing
      return { payment, order: payment.order, duplicate: true };
    }
    if (!['PENDING', 'PROCESSING'].includes(payment.status)) {
      // FAILED / CANCELLED / EXPIRED attempts cannot be resurrected by a webhook
      return { payment, order: payment.order, ignored: true };
    }
    if (payment.order.status !== 'PENDING_PAYMENT') {
      // e.g. order was CANCELLED after initiation: never pay a dead order
      throw reject(`Order is not in a payable state (${payment.order.status})`, 409, 'ORDER_NOT_PAYABLE', {
        orderNumber: payment.order.orderNumber,
        orderStatus: payment.order.status,
      });
    }

    // 6. Lock the attempt row: concurrent webhook deliveries serialize here
    const locked = await tx.$queryRaw`
      SELECT id, status FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE
    `;
    if (locked[0].status === 'SUCCESS') {
      // Raced with a concurrent processor that already finished
      const fresh = await tx.payment.findUnique({ where: { id: payment.id }, include: { order: true } });
      return { payment: fresh, order: fresh.order, duplicate: true };
    }

    // 7. FAILURE outcome: record it; the order stays PENDING_PAYMENT (retryable)
    if (event.outcome !== 'SUCCESS') {
      const failed = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          resultCode: event.resultCode || 'PROVIDER_ERROR',
          failureMessage: event.failureMessage || 'Payment failed',
        },
      });
      postCommitAudits.push({
        action: 'PAYMENT_FAILED',
        entityName: 'Payment',
        entityId: payment.id,
        details: {
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber,
          providerRef: event.providerRef,
          resultCode: event.resultCode,
        },
      });
      return { payment: failed, order: payment.order, failed: true };
    }

    // 8. SUCCESS outcome — one atomic financial transaction:
    //    payment SUCCESS + order COMMITMENT_PAID + one history entry.
    //    The DB partial unique index (one successful COMMITMENT payment per
       //    order) is the final backstop against duplicate financial state.
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        resultCode: event.resultCode || 'SUCCESS',
        failureMessage: null,
        verifiedAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
        payload: { providerEvent: { providerRef: event.providerRef, orderNumber: event.orderNumber, occurredAt: event.occurredAt } },
      },
    });

    const { updatedOrder } = await applyOrderStatusTransition(tx, {
      orderId: payment.orderId,
      toStatus: 'COMMITMENT_PAID',
      changedByType: 'SYSTEM',
      notes: `Commitment payment verified (${provider.name} ref ${event.providerRef})`,
    });

    postCommitAudits.push({
      action: 'COMMITMENT_PAYMENT_APPLIED',
      entityName: 'Payment',
      entityId: payment.id,
      details: {
        orderId: payment.orderId,
        orderNumber: payment.order.orderNumber,
        provider: provider.name,
        providerRef: event.providerRef,
        amountUgx: payment.amountUgx,
        currency: payment.currency,
      },
    });

    return { payment: updatedPayment, order: updatedOrder, verified: true };
    });
  } catch (error) {
    // Rejection audits are written AFTER the transaction has rolled back:
    // audit writes must never hold a doomed financial transaction open, and
    // an audit failure must never roll back a verified payment.
    if (error.rejectionAudit) {
      await logAudit(error.rejectionAudit);
    }
    throw error;
  }

  // Audits for processed events are written AFTER the financial commit.
  for (const audit of postCommitAudits) {
    await logAudit(audit);
  }

  return result;
}

// ============================================================
// CUSTOMER: payment lookup (ownership-enforced)
// ============================================================
async function getCustomerOrderPayment(userId, orderId) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  const payments = await prisma.payment.findMany({
    where: { orderId: order.id, purpose: 'COMMITMENT' },
    orderBy: { createdAt: 'desc' },
  });
  return {
    payments: payments.map(formatPayment),
    activePayment: payments.find((p) => ['PENDING', 'PROCESSING'].includes(p.status)) || null,
  };
}

// ============================================================
// ADMIN: read-only payment visibility (no financial mutation here)
// ============================================================
async function getAdminOrderPayment(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  const payments = await prisma.payment.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: 'desc' },
  });
  return { orderId: order.id, orderNumber: order.orderNumber, payments: payments.map(formatPayment) };
}

module.exports = {
  formatPayment,
  initiateCommitmentPayment,
  processWebhook,
  getCustomerOrderPayment,
  getAdminOrderPayment,
  PAYMENT_ATTEMPT_TTL_MINUTES,
  CURRENCY,
};
