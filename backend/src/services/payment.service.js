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
    paymentType: payment.paymentType,
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
// AUTHORITATIVE BALANCE CALCULATION (integer UGX, DB-backed)
// balanceDue = orderTotal - commitmentPaid - balancePaid
// Never trust client amounts or request body values.
// ============================================================
async function calculateOrderBalance(tx, orderId) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { payments: true },
  });
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const successfulPayments = order.payments.filter((p) => p.status === 'SUCCESS');
  const successfulCommitmentPayments = successfulPayments.filter((p) => p.purpose === 'COMMITMENT');
  const successfulBalancePayments = successfulPayments.filter((p) => p.purpose === 'BALANCE');

  const commitmentPaidUgx = successfulCommitmentPayments.reduce((sum, p) => sum + p.amountUgx, 0);
  const balancePaidUgx = successfulBalancePayments.reduce((sum, p) => sum + p.amountUgx, 0);
  const totalPaidUgx = commitmentPaidUgx + balancePaidUgx;

  // Financial invariant checks:
  // - at most 1 successful commitment payment
  // - at most 1 successful balance payment
  // - total paid cannot exceed order total
  if (successfulCommitmentPayments.length > 1) {
    throw new AppError('Corrupted financial state: multiple commitment payments found', 500);
  }
  if (successfulBalancePayments.length > 1) {
    throw new AppError('Corrupted financial state: multiple balance payments found', 500);
  }
  if (totalPaidUgx > order.totalAmount) {
    throw new AppError('Corrupted financial state: total paid exceeds order total amount', 500);
  }

  const balanceDueUgx = Math.max(0, order.totalAmount - totalPaidUgx);

  return {
    orderTotalUgx: order.totalAmount,
    commitmentAmountUgx: order.commitmentAmount,
    remainingBalanceUgx: order.remainingBalance,
    commitmentPaidUgx,
    balancePaidUgx,
    totalPaidUgx,
    balanceDueUgx,
    hasSuccessfulCommitment: successfulCommitmentPayments.length === 1,
    hasSuccessfulBalance: successfulBalancePayments.length === 1,
    isFullyPaid: balanceDueUgx === 0 && (successfulCommitmentPayments.length === 1 || order.totalAmount === 0),
  };
}

// ============================================================
// COMPLETION GUARD (Centralized service-level check)
// Verifies all business and financial prerequisites for completion:
// - commitment payment completed
// - fulfillment completed (DELIVERED for home delivery, PICKED_UP for station)
// - balance fully paid (balanceDue === 0)
// - order not cancelled or refunded
// - order not already completed
// ============================================================
async function canCompleteOrder(tx, orderId) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      delivery: true,
      payments: true,
    },
  });
  if (!order) {
    return { ok: false, reason: 'Order not found' };
  }

  if (order.status === 'COMPLETED') {
    return { ok: false, reason: 'Order is already completed' };
  }
  if (order.status === 'CANCELLED') {
    return { ok: false, reason: 'Cannot complete a cancelled order' };
  }
  if (order.status === 'REFUNDED') {
    return { ok: false, reason: 'Cannot complete a refunded order' };
  }

  // 1. Commitment payment verification
  const successfulCommitments = order.payments.filter(
    (p) => p.purpose === 'COMMITMENT' && p.status === 'SUCCESS'
  );
  if (order.totalAmount > 0 && successfulCommitments.length !== 1) {
    return { ok: false, reason: 'Commitment payment is not completed' };
  }

  // 2. Fulfillment verification
  const delivery = order.delivery;
  if (!delivery) {
    return { ok: false, reason: 'No fulfillment record found for order' };
  }
  if (order.deliveryType === 'HOME_DELIVERY' && delivery.status !== 'DELIVERED') {
    return { ok: false, reason: `Home delivery must be DELIVERED (current: ${delivery.status})` };
  }
  if (order.deliveryType === 'PICKUP_STATION' && delivery.status !== 'PICKED_UP') {
    return { ok: false, reason: `Pickup station delivery must be PICKED_UP (current: ${delivery.status})` };
  }

  // 3. Balance verification
  const balance = await calculateOrderBalance(tx, orderId);
  if (balance.balanceDueUgx > 0) {
    return { ok: false, reason: `Outstanding balance of UGX ${balance.balanceDueUgx} must be paid` };
  }
  if (balance.totalPaidUgx !== order.totalAmount) {
    return { ok: false, reason: 'Total paid does not match order total' };
  }

  return { ok: true, order, balance };
}

// ============================================================
// COMPLETE ORDER IF ELIGIBLE (Zero-balance order completion)
// Transitions DELIVERED/PICKED_UP -> BALANCE_PAID -> COMPLETED
// without creating fake financial records.
// ============================================================
async function completeOrderIfEligible(tx, orderId, { changedByType = 'SYSTEM', changedById = null, notes = null } = {}) {
  const guard = await canCompleteOrder(tx, orderId);
  if (!guard.ok) {
    return { completed: false, reason: guard.reason };
  }

  const order = guard.order;
  // If order is currently in DELIVERED or PICKED_UP, transition to BALANCE_PAID
  if (['DELIVERED', 'PICKED_UP'].includes(order.status)) {
    await applyOrderStatusTransition(tx, {
      orderId: order.id,
      toStatus: 'BALANCE_PAID',
      changedByType,
      changedById,
      notes: notes || 'Balance obligation satisfied (zero balance order)',
    });
  }

  // Transition BALANCE_PAID -> COMPLETED
  const { updatedOrder } = await applyOrderStatusTransition(tx, {
    orderId: order.id,
    toStatus: 'COMPLETED',
    changedByType,
    changedById,
    notes: notes || 'Order completed upon fulfillment verification (zero balance)',
  });

  await logAudit({
    action: 'ORDER_COMPLETED',
    entityName: 'Order',
    entityId: order.id,
    details: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      zeroBalance: true,
      reason: 'Fulfillment completed and zero balance satisfied',
    },
  });

  return { completed: true, order: updatedOrder };
}

// ============================================================
// COMMITMENT PAYMENT INITIATION (Phase 6 preserved)
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
      // Stale attempt: expire it and start fresh
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

    // 5. Ask provider to initiate/refresh the charge
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
        purpose: 'COMMITMENT',
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
// BALANCE PAYMENT INITIATION (Phase 8)
// Fulfillment completed prerequisite, server-authoritative balance,
// concurrency protected, reusable active attempt.
// ============================================================
async function initiateBalancePayment(userId, orderId) {
  const provider = getPaymentProvider(env.PAYMENT_PROVIDER);
  assertProviderAllowed(provider);

  return prisma.$transaction(async (tx) => {
    // 1. Lazy expiry sweep
    await applyPaymentExpiration(tx);

    // 2. Order must exist and belong to this customer
    const order = await tx.order.findFirst({
      where: { id: orderId, userId },
      include: { delivery: true },
    });
    if (!order) {
      throw new AppError('Order not found', 404);
    }
    if (order.currency !== CURRENCY) {
      throw new AppError(`Order currency ${order.currency} is not supported`, 422);
    }

    // 3. Terminal status checks
    if (order.status === 'CANCELLED') {
      throw new AppError('Order has been cancelled and cannot accept balance payment', 409);
    }
    if (order.status === 'COMPLETED') {
      // Check if existing successful balance payment exists
      const existingSuccess = await tx.payment.findFirst({
        where: { orderId: order.id, purpose: 'BALANCE', status: 'SUCCESS' },
        orderBy: { verifiedAt: 'desc' },
      });
      if (existingSuccess) {
        return { payment: existingSuccess, order, reused: true };
      }
      throw new AppError('Order is already completed', 409);
    }

    // 4. Fulfillment eligibility boundary:
    //    Home delivery requires DELIVERED status on both order and delivery.
    //    Pickup station requires PICKED_UP status on both order and delivery.
    const delivery = order.delivery;
    if (!delivery) {
      throw new AppError('Fulfillment record not found for this order', 404);
    }

    const isHomeFulfillmentComplete =
      order.deliveryType === 'HOME_DELIVERY' &&
      order.status === 'DELIVERED' &&
      delivery.status === 'DELIVERED';

    const isPickupFulfillmentComplete =
      order.deliveryType === 'PICKUP_STATION' &&
      order.status === 'PICKED_UP' &&
      delivery.status === 'PICKED_UP';

    if (!isHomeFulfillmentComplete && !isPickupFulfillmentComplete) {
      throw new AppError(
        `Order is not eligible for balance payment. Fulfillment must be completed first ` +
          `(Home delivery must be DELIVERED; Pickup station must be PICKED_UP). Current order status: ${order.status}`,
        409
      );
    }

    // 5. Authoritative balance calculation
    const balance = await calculateOrderBalance(tx, order.id);

    // Check if balance has already been paid
    if (balance.hasSuccessfulBalance) {
      const existingSuccess = await tx.payment.findFirst({
        where: { orderId: order.id, purpose: 'BALANCE', status: 'SUCCESS' },
        orderBy: { verifiedAt: 'desc' },
      });
      return { payment: existingSuccess, order, reused: true, balance };
    }

    // Check if balance due is zero
    if (balance.balanceDueUgx <= 0) {
      throw new AppError('This order has no outstanding balance due', 409);
    }

    // 6. Concurrency lock on order row
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;

    // 7. Idempotent attempt reuse — one active balance attempt per order
    const reusableStatuses = ['PENDING', 'PROCESSING'];
    let attempt = await tx.payment.findFirst({
      where: { orderId: order.id, purpose: 'BALANCE', status: { in: reusableStatuses } },
      orderBy: { createdAt: 'desc' },
    });

    const authoritativeAmount = balance.balanceDueUgx;

    if (!attempt) {
      attempt = await tx.payment.create({
        data: {
          orderId: order.id,
          purpose: 'BALANCE',
          paymentType: 'BALANCE_ONLINE',
          provider: provider.name,
          transactionRef: `PAY-${crypto.randomUUID()}`,
          amountUgx: authoritativeAmount,
          currency: CURRENCY,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + PAYMENT_ATTEMPT_TTL_MINUTES * 60 * 1000),
        },
      });
    } else if (attempt.amountUgx !== authoritativeAmount) {
      // Stale attempt amount: expire it and create fresh
      await tx.payment.update({
        where: { id: attempt.id },
        data: { status: 'EXPIRED', resultCode: 'TIMEOUT', failureMessage: 'Superseded by updated balance attempt' },
      });
      attempt = await tx.payment.create({
        data: {
          orderId: order.id,
          purpose: 'BALANCE',
          paymentType: 'BALANCE_ONLINE',
          provider: provider.name,
          transactionRef: `PAY-${crypto.randomUUID()}`,
          amountUgx: authoritativeAmount,
          currency: CURRENCY,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + PAYMENT_ATTEMPT_TTL_MINUTES * 60 * 1000),
        },
      });
    }

    // 8. Ask provider to initiate/refresh the charge
    const result = provider.initiatePayment({ payment: attempt });
    attempt = await tx.payment.update({
      where: { id: attempt.id },
      data: { providerRef: result.providerRef },
    });

    await logAudit({
      action: 'BALANCE_PAYMENT_INITIATED',
      entityName: 'Payment',
      entityId: attempt.id,
      details: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        purpose: 'BALANCE',
        provider: provider.name,
        providerRef: result.providerRef,
        amountUgx: attempt.amountUgx,
        currency: attempt.currency,
        balanceDueUgx: authoritativeAmount,
      },
    });

    return { payment: attempt, order, balance, reused: false };
  });
}

// ============================================================
// UNIFIED PAYMENT INITIATION DISPATCHER
// ============================================================
async function initiatePayment(userId, orderId, { purpose } = {}) {
  if (purpose === 'BALANCE') {
    return initiateBalancePayment(userId, orderId);
  }
  if (purpose === 'COMMITMENT') {
    return initiateCommitmentPayment(userId, orderId);
  }

  // Automatic determination based on current order state
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: { status: true },
  });
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  if (['DELIVERED', 'PICKED_UP'].includes(order.status)) {
    return initiateBalancePayment(userId, orderId);
  }
  return initiateCommitmentPayment(userId, orderId);
}

// ============================================================
// WEBHOOK PROCESSING (secure, transactional, idempotent)
// Supports both COMMITMENT and BALANCE payment purposes.
// ============================================================
async function processWebhook(rawBody, headers) {
  const provider = getPaymentProvider(env.PAYMENT_PROVIDER);
  assertProviderAllowed(provider);

  // 1. Signature verification + normalization (provider boundary)
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
      // 2. Lazy expiry sweep
      await applyPaymentExpiration(tx);

      // 3. Correlate the provider event with internal payment attempt
      const payment = await tx.payment.findFirst({
        where: { provider: provider.name, providerRef: event.providerRef },
        include: {
          order: {
            include: { delivery: true },
          },
        },
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

      // 4. Validate event against AUTHORITATIVE internal state
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
      if (event.purpose && event.purpose !== payment.purpose) {
        throw reject('Webhook purpose mismatch', 422, 'PURPOSE_MISMATCH');
      }

      // 5. Idempotency & state guards
      if (payment.status === 'SUCCESS') {
        // Duplicate delivery of an already-processed success: acknowledge, change nothing
        return { payment, order: payment.order, duplicate: true };
      }
      if (!['PENDING', 'PROCESSING'].includes(payment.status)) {
        // FAILED / CANCELLED / EXPIRED attempts cannot be resurrected by a webhook
        return { payment, order: payment.order, ignored: true };
      }

      // Check order payable state
      if (payment.order.status === 'CANCELLED') {
        throw reject(`Order is not in a payable state (${payment.order.status})`, 409, 'ORDER_NOT_PAYABLE', {
          orderNumber: payment.order.orderNumber,
          orderStatus: payment.order.status,
        });
      }

      if (payment.purpose === 'COMMITMENT') {
        if (payment.order.status !== 'PENDING_PAYMENT') {
          throw reject(`Order is not in a payable state (${payment.order.status})`, 409, 'ORDER_NOT_PAYABLE', {
            orderNumber: payment.order.orderNumber,
            orderStatus: payment.order.status,
          });
        }
      } else if (payment.purpose === 'BALANCE') {
        // Balance payment eligibility: must be in DELIVERED or PICKED_UP
        if (!['DELIVERED', 'PICKED_UP', 'BALANCE_PAID'].includes(payment.order.status)) {
          throw reject(`Order is not eligible for balance payment (${payment.order.status})`, 409, 'ORDER_NOT_PAYABLE', {
            orderNumber: payment.order.orderNumber,
            orderStatus: payment.order.status,
          });
        }
      }

      // 6. Lock attempt row: concurrent webhook deliveries serialize here
      const locked = await tx.$queryRaw`
        SELECT id, status FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE
      `;
      if (locked[0].status === 'SUCCESS') {
        const fresh = await tx.payment.findUnique({
          where: { id: payment.id },
          include: { order: true },
        });
        return { payment: fresh, order: fresh.order, duplicate: true };
      }

      // 7. FAILURE outcome: record it; order remains unpaid for this payment
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
          action: payment.purpose === 'BALANCE' ? 'BALANCE_PAYMENT_FAILED' : 'PAYMENT_FAILED',
          entityName: 'Payment',
          entityId: payment.id,
          details: {
            orderId: payment.orderId,
            orderNumber: payment.order.orderNumber,
            purpose: payment.purpose,
            providerRef: event.providerRef,
            resultCode: event.resultCode,
          },
        });
        return { payment: failed, order: payment.order, failed: true };
      }

      // 8. SUCCESS outcome:
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

      let updatedOrder;

      if (payment.purpose === 'COMMITMENT') {
        const transition = await applyOrderStatusTransition(tx, {
          orderId: payment.orderId,
          toStatus: 'COMMITMENT_PAID',
          changedByType: 'SYSTEM',
          notes: `Commitment payment verified (${provider.name} ref ${event.providerRef})`,
        });
        updatedOrder = transition.updatedOrder;

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
      } else if (payment.purpose === 'BALANCE') {
        // Balance payment success:
        // Invariant guard check
        const guard = await canCompleteOrder(tx, payment.orderId);
        if (!guard.ok) {
          throw reject(`Cannot complete order: ${guard.reason}`, 409, 'COMPLETION_GUARD_FAILED');
        }

        // Apply centralized order status transitions:
        // DELIVERED / PICKED_UP -> BALANCE_PAID
        if (['DELIVERED', 'PICKED_UP'].includes(payment.order.status)) {
          await applyOrderStatusTransition(tx, {
            orderId: payment.orderId,
            toStatus: 'BALANCE_PAID',
            changedByType: 'SYSTEM',
            notes: `Balance payment verified (${provider.name} ref ${event.providerRef})`,
          });
        }

        // BALANCE_PAID -> COMPLETED
        const completion = await applyOrderStatusTransition(tx, {
          orderId: payment.orderId,
          toStatus: 'COMPLETED',
          changedByType: 'SYSTEM',
          notes: 'Order completed — balance paid in full and fulfillment verified',
        });
        updatedOrder = completion.updatedOrder;

        // In-app customer notification
        await tx.notification.create({
          data: {
            userId: payment.order.userId,
            title: 'Order Completed',
            message: `Your balance payment of UGX ${payment.amountUgx.toLocaleString()} was successful. Order ${payment.order.orderNumber} is now complete!`,
            type: 'ORDER_UPDATE',
          },
        });

        postCommitAudits.push({
          action: 'BALANCE_PAYMENT_APPLIED',
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

        postCommitAudits.push({
          action: 'ORDER_COMPLETED',
          entityName: 'Order',
          entityId: payment.orderId,
          details: {
            orderId: payment.orderId,
            orderNumber: payment.order.orderNumber,
            totalAmount: payment.order.totalAmount,
            amountPaidUgx: payment.amountUgx,
            completedAt: new Date().toISOString(),
          },
        });
      }

      return { payment: updatedPayment, order: updatedOrder, verified: true };
    });
  } catch (error) {
    if (error.rejectionAudit) {
      await logAudit(error.rejectionAudit);
    }
    throw error;
  }

  for (const audit of postCommitAudits) {
    await logAudit(audit);
  }

  return result;
}

// ============================================================
// CUSTOMER: payment lookup (ownership-enforced, full financial visibility)
// ============================================================
async function getCustomerOrderPayment(userId, orderId) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
  });
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const payments = await prisma.payment.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: 'desc' },
  });

  const balance = await calculateOrderBalance(prisma, order.id);
  const commitmentPayment = payments.find((p) => p.purpose === 'COMMITMENT' && p.status === 'SUCCESS');
  const balancePayment = payments.find((p) => p.purpose === 'BALANCE' && p.status === 'SUCCESS');

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    currency: order.currency,
    pricing: {
      totalUgx: order.totalAmount,
      commitmentUgx: order.commitmentAmount,
      remainingBalanceUgx: balance.balanceDueUgx,
      commitmentPaidUgx: balance.commitmentPaidUgx,
      balancePaidUgx: balance.balancePaidUgx,
      totalPaidUgx: balance.totalPaidUgx,
    },
    commitmentPaymentStatus: commitmentPayment ? 'SUCCESS' : payments.find((p) => p.purpose === 'COMMITMENT')?.status || 'UNPAID',
    balancePaymentStatus: balancePayment
      ? 'SUCCESS'
      : balance.balanceDueUgx === 0
        ? 'NOT_REQUIRED'
        : payments.find((p) => p.purpose === 'BALANCE')?.status || 'UNPAID',
    isFullyPaid: balance.isFullyPaid,
    isCompleted: order.status === 'COMPLETED',
    payments: payments.map(formatPayment),
    activePayment: payments.find((p) => ['PENDING', 'PROCESSING'].includes(p.status)) || null,
  };
}

// ============================================================
// ADMIN: read-only payment visibility (no financial mutation here)
// ============================================================
async function getAdminOrderPayment(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { delivery: true },
  });
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  const payments = await prisma.payment.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: 'desc' },
  });

  const balance = await calculateOrderBalance(prisma, order.id);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    pricing: {
      totalUgx: order.totalAmount,
      commitmentUgx: order.commitmentAmount,
      remainingBalanceUgx: balance.balanceDueUgx,
      commitmentPaidUgx: balance.commitmentPaidUgx,
      balancePaidUgx: balance.balancePaidUgx,
      totalPaidUgx: balance.totalPaidUgx,
    },
    payments: payments.map(formatPayment),
    fulfillment: order.delivery
      ? {
          fulfillmentType: order.delivery.fulfillmentType,
          status: order.delivery.status,
          assignedAdminId: order.delivery.assignedAdminId,
          completedAt: order.delivery.completedAt,
        }
      : null,
  };
}

module.exports = {
  formatPayment,
  calculateOrderBalance,
  canCompleteOrder,
  completeOrderIfEligible,
  initiatePayment,
  initiateCommitmentPayment,
  initiateBalancePayment,
  processWebhook,
  getCustomerOrderPayment,
  getAdminOrderPayment,
  PAYMENT_ATTEMPT_TTL_MINUTES,
  CURRENCY,
};
