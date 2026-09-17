const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const {
  DELIVERY_STATUSES,
  DELIVERY_STATUS_TRANSITIONS,
  DELIVERY_TYPE_ALLOWED_STATUSES,
  DELIVERY_FAILURE_REASONS,
  ORDER_TO_DELIVERY_SYNC,
  DELIVERY_TERMINAL_STATUSES,
  DELIVERY_CANCELLABLE_STATUSES,
} = require('../constants');
// Loaded lazily inside applyDeliveryStatusTransition to avoid a require-cycle
// (order.service requires delivery.service at module load; delivery.service
// needs order.service only at call time).
const { logAudit } = require('./audit.service');

/**
 * Delivery / Fulfillment service (Phase 7).
 *
 * - One delivery record per order, created transactionally at order creation
 *   (DB-enforced unique on deliveries.order_id).
 * - Home-delivery fee + distance reuse the Phase 5 pricing core
 *   (DeliveryPricingConfig + Haversine) — no competing pricing system.
 * - ALL delivery status changes go through applyDeliveryStatusTransition;
 *   order status changes it triggers go through the Phase 5 central
 *   applyOrderStatusTransition (single order state machine).
 * - Financial state is never touched from here: no payments, no refunds,
 *   no COMMITMENT_PAID, no automatic BALANCE_PAID.
 */

// ============================================================
// Pricing core (Phase 5 implementation, re-exported unchanged)
// ============================================================

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function getActiveDeliveryConfig() {
  return prisma.deliveryPricingConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Calculate the home-delivery fee in integer UGX from trusted server data.
 * Returns null when no active configuration exists.
 *   fee = base_fee + max(0, distance_km - free_radius_km) * per_km_rate
 */
function calculateDeliveryFee(config, distanceKm) {
  if (!config) return null;
  const distance = Math.max(0, Number(distanceKm) || 0);
  const freeRadius = Number(config.freeRadiusKm) || 0;
  const chargeableKm = Math.max(0, distance - freeRadius);

  const rawFee =
    config.baseFeeUgx + Math.round(chargeableKm * (config.perKmRateUgx || 0));

  return Math.max(rawFee, config.minimumFeeUgx || 0);
}

/**
 * Resolve the delivery fee for an order's fulfillment choice.
 * Returns integer UGX (0 for pickup).
 */
async function resolveDeliveryFee({ fulfillmentMethod, address }) {
  if (fulfillmentMethod === 'PICKUP_STATION') {
    return 0; // pickup: no delivery fee
  }

  const config = await getActiveDeliveryConfig();
  if (!config) {
    throw new AppError('Delivery pricing is not configured. Home delivery is temporarily unavailable.', 400);
  }

  const warehouseLat = Number(config.warehouseLat);
  const warehouseLng = Number(config.warehouseLng);
  const addressLat = address.latitude !== null && address.latitude !== undefined ? Number(address.latitude) : null;
  const addressLng = address.longitude !== null && address.longitude !== undefined ? Number(address.longitude) : null;

  if (addressLat === null || addressLng === null) {
    // Address without coordinates: charge the minimum fee (safe fallback)
    return Math.max(config.minimumFeeUgx || 0, config.baseFeeUgx || 0);
  }

  const distanceKm = haversineKm(warehouseLat, warehouseLng, addressLat, addressLng);
  return calculateDeliveryFee(config, distanceKm);
}

/**
 * Independent, deterministic quote helper (distance + fee) for a given
 * address/config pair. Used by tests and available for future quote endpoints.
 */
function calculateDeliveryQuote({ config, address }) {
  const addressLat = address.latitude !== null && address.latitude !== undefined ? Number(address.latitude) : null;
  const addressLng = address.longitude !== null && address.longitude !== undefined ? Number(address.longitude) : null;

  if (addressLat === null || addressLng === null) {
    return {
      distanceKm: null,
      deliveryFeeUgx: config ? Math.max(config.minimumFeeUgx || 0, config.baseFeeUgx || 0) : null,
      note: 'NO_COORDINATES_MINIMUM_FEE',
    };
  }

  const distanceKm = haversineKm(
    Number(config.warehouseLat),
    Number(config.warehouseLng),
    addressLat,
    addressLng
  );
  return { distanceKm, deliveryFeeUgx: calculateDeliveryFee(config, distanceKm), note: null };
}

// ============================================================
// Notifications (minimal in-app events; never break ops on failure)
// ============================================================

async function notifyDeliveryEvent(userId, { title, message, linkUrl = null }) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        title: String(title).slice(0, 150),
        message: String(message).slice(0, 1000),
        type: 'DELIVERY_UPDATE',
        linkUrl,
      },
    });
  } catch (error) {
    // Notification failure must never corrupt an operational transaction
    require('../utils/logger').error('Delivery notification failed:', error.message);
  }
}

// ============================================================
// Creation (called inside the order-creation transaction)
// ============================================================

/**
 * Create the fulfillment record for a freshly created order, inside the
 * caller's transaction. Snapshots are copied from the order's permanent
 * Phase 5 snapshots (single source of historical truth).
 * Uniqueness: deliveries.order_id is UNIQUE at the DB level.
 */
async function createDeliveryForOrder(tx, order) {
  return tx.delivery.create({
    data: {
      orderId: order.id,
      fulfillmentType: order.deliveryType, // HOME_DELIVERY | PICKUP_STATION
      status: DELIVERY_STATUSES.PENDING,
      deliveryFeeUgx: order.deliveryFee,
      addressSnapshot: order.deliveryType === 'HOME_DELIVERY' ? order.addressSnapshot : undefined,
      stationSnapshot: order.deliveryType === 'PICKUP_STATION' ? order.stationSnapshot : undefined,
    },
  });
}

// ============================================================
// Views
// ============================================================

function buildCustomerDeliveryResponse(delivery) {
  const d = typeof delivery.toJSON === 'function' ? delivery : delivery;
  return {
    id: d.id,
    orderId: d.orderId,
    fulfillmentType: d.fulfillmentType,
    status: d.status,
    deliveryFeeUgx: d.deliveryFeeUgx,
    distanceKm: d.distanceKm !== null && d.distanceKm !== undefined ? Number(d.distanceKm) : null,
    addressSnapshot: d.addressSnapshot || null,
    stationSnapshot: d.stationSnapshot || null,
    scheduledAt: d.scheduledAt,
    startedAt: d.startedAt,
    completedAt: d.completedAt,
    failureReason: d.failureReason || null,
    failureMessage: d.failureMessage || null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function buildAdminDeliveryResponse(delivery) {
  return {
    ...buildCustomerDeliveryResponse(delivery),
    notes: delivery.notes || null,
    assignedAdmin: delivery.assignedAdmin
      ? { id: delivery.assignedAdmin.id, fullName: delivery.assignedAdmin.fullName, role: delivery.assignedAdmin.role }
      : null,
  };
}

/**
 * Customer view of the delivery for THEIR order (IDOR-safe via order ownership).
 */
async function getDeliveryForOrder(userId, orderId) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId }, // ownership enforced from authenticated identity
    select: { id: true, orderNumber: true, status: true },
  });
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  const delivery = await prisma.delivery.findUnique({
    where: { orderId },
  });
  if (!delivery) {
    throw new AppError('Delivery not found', 404);
  }
  return buildCustomerDeliveryResponse(delivery);
}

// ============================================================
// Admin listing (paginated, filterable)
// ============================================================

async function listDeliveries({ page = 1, limit = 20, status = null, fulfillmentType = null, assignedAdminId = null, orderNumber = null } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where = {};
  if (status) where.status = status;
  if (fulfillmentType) where.fulfillmentType = fulfillmentType;
  if (assignedAdminId) where.assignedAdminId = assignedAdminId;
  if (orderNumber) where.order = { orderNumber };

  const [total, deliveries] = await Promise.all([
    prisma.delivery.count({ where }),
    prisma.delivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
      include: { assignedAdmin: { select: { id: true, fullName: true, role: true } }, order: { select: { orderNumber: true } } },
    }),
  ]);

  return {
    items: deliveries.map((d) => ({
      ...buildAdminDeliveryResponse(d),
      orderNumber: d.order.orderNumber,
    })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

async function getDeliveryById(deliveryId) {
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: { assignedAdmin: { select: { id: true, fullName: true, role: true } }, order: { select: { orderNumber: true, status: true, userId: true } } },
  });
  if (!delivery) {
    throw new AppError('Delivery not found', 404);
  }
  return { ...buildAdminDeliveryResponse(delivery), orderNumber: delivery.order.orderNumber, orderStatus: delivery.order.status };
}

// ============================================================
// Assignment
// ============================================================

/**
 * Assign (or reassign) a home delivery to an eligible staff member.
 * Transactional + row-locked. Terminal states can never be (re)assigned.
 * Pickup orders are never assigned (station-based fulfillment).
 */
async function assignDelivery({ deliveryId, targetAdminId, actor, ipAddress = null, notes = null }) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT id, status, "fulfillment_type" AS "fulfillmentType", "assigned_admin_id" AS "assignedAdminId"
      FROM deliveries
      WHERE id = ${deliveryId}::uuid
      FOR UPDATE
    `;
    const delivery = rows[0];
    if (!delivery) {
      throw new AppError('Delivery not found', 404);
    }
    if (delivery.fulfillmentType !== 'HOME_DELIVERY') {
      throw new AppError('Pickup fulfillments are not assigned to staff', 409);
    }
    if (DELIVERY_TERMINAL_STATUSES.includes(delivery.status)) {
      throw new AppError(`Delivery in status ${delivery.status} cannot be assigned`, 409);
    }

    const target = await tx.admin.findFirst({
      where: { id: targetAdminId, isActive: true, role: { in: ['DISPATCHER', 'ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true, fullName: true, role: true },
    });
    if (!target) {
      throw new AppError('Assignment target must be an active dispatcher or admin', 422);
    }

    const updated = await tx.delivery.update({
      where: { id: deliveryId },
      data: {
        assignedAdminId: target.id,
        status: delivery.status === 'PENDING' ? 'ASSIGNED' : delivery.status,
        notes: notes ? String(notes).slice(0, 500) : delivery.notes,
      },
    });

    return { updated, target, previousAssignee: delivery.assignedAdminId, previousStatus: delivery.status };
  }).then(async ({ updated, target, previousAssignee, previousStatus }) => {
    // Post-commit audit + notification (never rolls back the assignment)
    await logAudit({
      adminId: actor.id,
      action: previousAssignee && previousAssignee !== target.id ? 'DELIVERY_REASSIGNED' : 'DELIVERY_ASSIGNED',
      entityName: 'Delivery',
      entityId: updated.id,
      details: {
        orderId: updated.orderId,
        from: previousAssignee || null,
        to: target.id,
        targetRole: target.role,
        previousStatus,
      },
      ipAddress,
    });
    return updated;
  });
}

// ============================================================
// Central delivery status transition (single mechanism)
// ============================================================

/**
 * THE central delivery status transition.
 * - Validates against DELIVERY_STATUS_TRANSITIONS + fulfillment-type branch.
 * - Idempotent: repeating the current status is a no-op (no history, no order
 *   transition, no side effects) so staff/client retries are safe.
 * - Syncs the ORDER through the Phase 5 central applyOrderStatusTransition
 *   whenever the target maps to an order state — the order machine stays
 *   authoritative (e.g. delivery OUT_FOR_DELIVERY requires the order to be
 *   READY_FOR_DELIVERY, otherwise the order map rejects with 409).
 * - Caller owns the audit/notification side effects (post-commit), matching
 *   the Phase 6 financial-audit-safety convention.
 *
 * tx: Prisma transaction client.
 * syncOrder=false: caller already moved the ORDER (admin lifecycle sync) —
 *   only the delivery row changes.
 * Returns { delivery, orderTransition, idempotentRepeat, previousStatus }.
 */
async function applyDeliveryStatusTransition(tx, { deliveryId, toStatus, changedByType = 'ADMIN', changedById = null, failureReason = null, failureMessage = null, notes = null, scheduledAt = undefined, syncOrder = true }) {
  if (!DELIVERY_STATUS_TRANSITIONS[toStatus]) {
    throw new AppError(`Unknown delivery status: ${toStatus}`, 422);
  }

  const rows = await tx.$queryRaw`
    SELECT id, status, "fulfillment_type" AS "fulfillmentType", "order_id" AS "orderId", "assigned_admin_id" AS "assignedAdminId"
    FROM deliveries
    WHERE id = ${deliveryId}::uuid
    FOR UPDATE
  `;
  const delivery = rows[0];
  if (!delivery) {
    throw new AppError('Delivery not found', 404);
  }

  // Idempotent repeat: same status is a safe no-op
  if (delivery.status === toStatus) {
    const current = await tx.delivery.findUnique({ where: { id: deliveryId } });
    return { delivery: current, orderTransition: null, idempotentRepeat: true, previousStatus: delivery.status };
  }

  const allowed = DELIVERY_STATUS_TRANSITIONS[delivery.status] || [];
  if (!allowed.includes(toStatus)) {
    throw new AppError(`Invalid delivery transition: ${delivery.status} → ${toStatus}`, 409);
  }
  if (!DELIVERY_TYPE_ALLOWED_STATUSES[delivery.fulfillmentType].includes(toStatus)) {
    throw new AppError(`Status ${toStatus} is not valid for ${delivery.fulfillmentType}`, 409);
  }
  if (toStatus === 'FAILED') {
    if (!failureReason || !DELIVERY_FAILURE_REASONS.includes(failureReason)) {
      throw new AppError('A controlled failureReason is required when marking a delivery FAILED', 422);
    }
    if (delivery.fulfillmentType === 'HOME_DELIVERY' && delivery.status !== 'OUT_FOR_DELIVERY') {
      throw new AppError('Home deliveries must be dispatched (OUT_FOR_DELIVERY) before failing', 409);
    }
  }
  if (toStatus === 'DELIVERED' && delivery.status !== 'OUT_FOR_DELIVERY') {
    throw new AppError('Deliveries must be OUT_FOR_DELIVERY before being marked DELIVERED', 409);
  }
  if (toStatus === 'PICKED_UP' && delivery.fulfillmentType !== 'PICKUP_STATION') {
    throw new AppError('Only pickup fulfillments can reach PICKED_UP', 409);
  }

  const data = {
    status: toStatus,
    notes: notes !== null && notes !== undefined ? String(notes).slice(0, 500) : undefined,
    scheduledAt: scheduledAt !== undefined ? scheduledAt : undefined,
  };
  if (toStatus === 'OUT_FOR_DELIVERY') data.startedAt = new Date();
  if (toStatus === 'DELIVERED' || toStatus === 'PICKED_UP') data.completedAt = new Date();
  if (toStatus === 'FAILED') {
    data.failureReason = failureReason;
    data.failureMessage = failureMessage ? String(failureMessage).slice(0, 500) : null;
  }

  const updatedDelivery = await tx.delivery.update({ where: { id: deliveryId }, data });

  // Order integration through the single Phase 5 order transition mechanism.
  // The order's transition map is authoritative: e.g. OUT_FOR_DELIVERY can
  // only be reached from order READY_FOR_DELIVERY, and re-dispatch after
  // DELIVERY_FAILED works because the order map allows
  // DELIVERY_FAILED → OUT_FOR_DELIVERY.
  //
  // ASSIGNMENT/READINESS are delivery-internal operational steps (no order
  // state exists for "assigned/ready" before the operational lifecycle), so
  // they only require the order to sit in a sane pre-condition state.
  const DELIVERY_OP_PRECONDITIONS = {
    ASSIGNED: ['COMMITMENT_PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'READY_FOR_PICKUP'],
    READY: ['CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'READY_FOR_PICKUP'],
  };

  let orderTransition = null;
  const mappedOrderStatus = ORDER_TO_DELIVERY_SYNC[toStatus];

  if (DELIVERY_OP_PRECONDITIONS[toStatus] && syncOrder) {
    const orderRow = await tx.order.findUnique({
      where: { id: delivery.orderId },
      select: { status: true },
    });
    if (!orderRow || !DELIVERY_OP_PRECONDITIONS[toStatus].includes(orderRow.status)) {
      throw new AppError(
        `Delivery cannot be marked ${toStatus} while order is in ${orderRow ? orderRow.status : 'unknown'} status`,
        409
      );
    }
    // delivery-internal step: order status intentionally unchanged
  } else if (mappedOrderStatus && syncOrder) {
    const { applyOrderStatusTransition } = require('./order.service'); // lazy: avoid require-cycle
    orderTransition = await applyOrderStatusTransition(tx, {
      orderId: delivery.orderId,
      toStatus: mappedOrderStatus,
      changedByType,
      changedById,
      notes: `Delivery ${toStatus}`,
    });
  }

  return { delivery: updatedDelivery, orderTransition, idempotentRepeat: false, previousStatus: delivery.status };
}

// ============================================================
// Cancellation sync (used by the Phase 5 cancellation paths)
// ============================================================

/**
 * Cancel the delivery of a cancelled order, inside the caller's transaction.
 * MUST be called only after the order row is locked and moved to CANCELLED.
 * Uses a conditional atomic update (status guard) instead of a row lock so
 * the lock order stays order → delivery everywhere (no deadlock) and a
 * concurrent completion can never be overwritten.
 * Returns 'CANCELLED' | 'ALREADY_TERMINAL' | 'NONE'.
 */
async function cancelDeliveryForOrder(tx, orderId, reason = null) {
  const delivery = await tx.delivery.findUnique({ where: { orderId }, select: { id: true, status: true } });
  if (!delivery) return { outcome: 'NONE', deliveryId: null };
  if (!DELIVERY_CANCELLABLE_STATUSES.includes(delivery.status)) {
    return { outcome: 'ALREADY_TERMINAL', deliveryId: delivery.id };
  }
  const result = await tx.delivery.updateMany({
    where: { id: delivery.id, status: { in: DELIVERY_CANCELLABLE_STATUSES } },
    data: { status: 'CANCELLED' },
  });
  if (result.count === 0) return { outcome: 'ALREADY_TERMINAL', deliveryId: delivery.id };
  return { outcome: 'CANCELLED', deliveryId: delivery.id, previousStatus: delivery.status };
}

// ============================================================
// Admin lifecycle sync + operational status updates
// ============================================================

/**
 * Keep the delivery consistent when the ORDER is transitioned by the Phase 5
 * lifecycle (adminUpdateOrderStatus). Called INSIDE the order transaction,
 * AFTER applyOrderStatusTransition has already moved the order — so the
 * delivery-side transition runs with syncOrder=false.
 * Terminal/financial order states (COMMITMENT_PAID, BALANCE_PAID, COMPLETED,
 * PAYMENT_FAILED, REFUNDED) require no delivery change.
 */
async function syncDeliveryForOrderTransition(tx, { orderId, toStatus, changedById = null, failureMessage = null }) {
  const delivery = await tx.delivery.findUnique({
    where: { orderId },
    select: { id: true, status: true, fulfillmentType: true },
  });
  if (!delivery) return { outcome: 'NONE', deliveryId: null };

  if (toStatus === 'CANCELLED') {
    return cancelDeliveryForOrder(tx, orderId);
  }

  if (toStatus === 'DELIVERY_FAILED') {
    // Order entered the failed-dispatch state → delivery FAILED (reason OTHER;
    // specifics preserved in failureMessage). No refund, no inventory change,
    // no payment mutation — Phase 5 rules own those.
    const { delivery: updated } = await applyDeliveryStatusTransition(tx, {
      deliveryId: delivery.id,
      toStatus: 'FAILED',
      changedByType: 'ADMIN',
      changedById,
      failureReason: 'OTHER',
      failureMessage,
      syncOrder: false,
    });
    return { outcome: 'FAILED', deliveryId: updated.id, previousStatus: delivery.status };
  }

  const target = ORDER_TO_DELIVERY_SYNC[toStatus];
  if (!target) return { outcome: 'NONE', deliveryId: delivery.id };

  // Resolve how the delivery reaches the target state from where it is.
  // [] = already consistent (ASSIGNED counts as consistent with pre-operational
  // order states — assignment happens during preparation). A path is applied
  // step-by-step through the SAME central transition map. Terminal order
  // states (DELIVERED/PICKED_UP) only accept a single hop, so a dispatch that
  // never happened cannot be fabricated by one admin action.
  const consistentWith = { CONFIRMED: ['PENDING', 'ASSIGNED'], PREPARING: ['PENDING', 'ASSIGNED'] };
  if ((consistentWith[toStatus] || []).includes(delivery.status)) {
    return { outcome: 'ALREADY_SYNCED', deliveryId: delivery.id };
  }

  const allowed = DELIVERY_TYPE_ALLOWED_STATUSES[delivery.fulfillmentType];
  function resolveSyncSteps(from, to) {
    if (from === to) return [];
    if (to === 'DELIVERED' || to === 'PICKED_UP') {
      return (DELIVERY_STATUS_TRANSITIONS[from] || []).includes(to) ? [to] : null;
    }
    const queue = [[from]];
    const seen = new Set([from]);
    while (queue.length) {
      const path = queue.shift();
      const last = path[path.length - 1];
      for (const next of DELIVERY_STATUS_TRANSITIONS[last] || []) {
        if (!allowed.includes(next)) continue;
        const np = [...path, next];
        if (next === to) return np.slice(1);
        if (!seen.has(next)) { seen.add(next); queue.push(np); }
      }
    }
    return null;
  }

  const steps = resolveSyncSteps(delivery.status, target);
  if (steps === null) {
    throw new AppError(
      `Delivery in status ${delivery.status} cannot be synced to ${target} for order transition ${toStatus}`,
      409
    );
  }
  if (steps.length === 0) return { outcome: 'ALREADY_SYNCED', deliveryId: delivery.id };

  let updated = null;
  for (const step of steps) {
    const r = await applyDeliveryStatusTransition(tx, {
      deliveryId: delivery.id,
      toStatus: step,
      changedByType: 'ADMIN',
      changedById,
      syncOrder: false,
      ...(step === 'FAILED' ? { failureReason: 'OTHER', failureMessage } : {}),
    });
    updated = r.delivery;
  }
  return { outcome: `SYNCED_${target}`, deliveryId: updated.id, previousStatus: delivery.status };
}

/**
 * Operational delivery status update (admin/dispatcher endpoint path).
 * Runs the central transition in a transaction; audit + customer
 * notification happen post-commit (audit failure can never corrupt state).
 * Idempotent repeats return the current state without side effects.
 */
async function updateDeliveryStatus({ deliveryId, toStatus, changedByType = 'ADMIN', changedById = null, failureReason = null, failureMessage = null, notes = null, scheduledAt = undefined, ipAddress = null }) {
  const result = await prisma.$transaction(async (tx) =>
    applyDeliveryStatusTransition(tx, {
      deliveryId,
      toStatus,
      changedByType,
      changedById,
      failureReason,
      failureMessage,
      notes,
      scheduledAt,
    })
  );

  if (!result.idempotentRepeat) {
    await logAudit({
      adminId: changedById,
      action: toStatus === 'FAILED' ? 'DELIVERY_FAILED' : 'DELIVERY_STATUS_CHANGED',
      entityName: 'Delivery',
      entityId: deliveryId,
      details: {
        orderId: result.delivery.orderId,
        from: result.previousStatus,
        to: toStatus,
        failureReason: toStatus === 'FAILED' ? failureReason : undefined,
      },
      ipAddress,
    });

    const order =
      result.orderTransition?.updatedOrder ||
      (await prisma.order.findUnique({ where: { id: result.delivery.orderId }, select: { id: true, userId: true, orderNumber: true } }));
    const notify = {
      OUT_FOR_DELIVERY: { title: 'Order out for delivery', message: `Your order ${order.orderNumber} is on the way.` },
      DELIVERED: { title: 'Order delivered', message: `Your order ${order.orderNumber} has been delivered.` },
      READY: { title: 'Ready for collection/dispatch', message: `Your order ${order.orderNumber} is ready.` },
      PICKED_UP: { title: 'Order picked up', message: `Your order ${order.orderNumber} has been picked up.` },
      FAILED: { title: 'Delivery attempt issue', message: `There was an issue fulfilling your order ${order.orderNumber}. We are retrying or contacting you.` },
    }[toStatus];
    if (notify && order.userId) {
      await notifyDeliveryEvent(order.userId, notify);
    }
  }

  return result;
}

module.exports = {
  // pricing
  haversineKm,
  calculateDeliveryFee,
  calculateDeliveryQuote,
  resolveDeliveryFee,
  getActiveDeliveryConfig,
  // fulfillment
  createDeliveryForOrder,
  getDeliveryForOrder,
  getDeliveryById,
  listDeliveries,
  assignDelivery,
  applyDeliveryStatusTransition,
  syncDeliveryForOrderTransition,
  updateDeliveryStatus,
  cancelDeliveryForOrder,
  // views + notifications
  buildCustomerDeliveryResponse,
  buildAdminDeliveryResponse,
  notifyDeliveryEvent,
};
