const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const {
  ORDER_STATUS_TRANSITIONS,
  CUSTOMER_CANCELLABLE_STATUSES,
} = require('../constants');
const { resolveTranslation, normalizeLanguage } = require('../utils/translation');
const { calculateCommitment } = require('../utils/currency');
const {
  resolveDeliveryFee,
  createDeliveryForOrder,
  cancelDeliveryForOrder,
  syncDeliveryForOrderTransition,
} = require('./delivery.service');
const { logAudit } = require('./audit.service');

const MAX_QTY_PER_LINE = 1000;

// ============================================================
// Order reference: FB-YYYYMMDD-XXXXXX (timestamp + random suffix,
// collision-checked against the DB inside the creation transaction)
// ============================================================
function generateOrderNumber() {
  const date = new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return `FB-${y}${m}${d}-${rand}`;
}

// ============================================================
// Centralized order money calculation (integer UGX only)
// subtotal + deliveryFee = total; commitment + balance = total
// ============================================================
function calculateOrderAmounts({ lines, deliveryFeeUgx, commitmentRule }) {
  const subtotalUgx = lines.reduce(
    (sum, line) => sum + Math.trunc(line.unitPriceUgx) * Math.trunc(line.quantity),
    0
  );
  const deliveryFee = Math.trunc(Number(deliveryFeeUgx) || 0);
  const totalUgx = subtotalUgx + deliveryFee;

  let commitmentUgx = 0;
  let remainingBalanceUgx = 0;
  if (commitmentRule) {
    const computed = calculateCommitment(totalUgx, {
      ruleType: commitmentRule.ruleType,
      percentageValue: Number(commitmentRule.percentageValue),
      flatValueUgx: commitmentRule.flatValueUgx,
      minCommitment: commitmentRule.minCommitment,
    });
    commitmentUgx = computed.commitmentAmount;
    remainingBalanceUgx = computed.remainingBalance;
  } else {
    commitmentUgx = totalUgx;
    remainingBalanceUgx = 0;
  }

  return { subtotalUgx, deliveryFeeUgx: deliveryFee, totalUgx, commitmentUgx, remainingBalanceUgx };
}

// ============================================================
// Fulfillment validation + snapshots (ownership/validity enforced)
// ============================================================
async function resolveFulfillment(tx, userId, { fulfillmentMethod, addressId, pickupStationId }) {
  if (fulfillmentMethod === 'HOME_DELIVERY') {
    const address = await tx.address.findFirst({
      where: { id: addressId, userId }, // IDOR-safe: must belong to the customer
    });
    if (!address) {
      throw new AppError('Delivery address not found or does not belong to you', 404);
    }
    return {
      deliveryType: 'HOME_DELIVERY',
      deliveryAddressId: address.id,
      pickupStationId: null,
      deliveryFeeUgx: await resolveDeliveryFee({ fulfillmentMethod, address }),
      snapshot: {
        title: address.title,
        district: address.district,
        division: address.division,
        streetAddress: address.streetAddress,
        latitude: address.latitude !== null && address.latitude !== undefined ? Number(address.latitude) : null,
        longitude: address.longitude !== null && address.longitude !== undefined ? Number(address.longitude) : null,
      },
    };
  }

  // PICKUP_STATION
  const station = await tx.pickupStation.findFirst({
    where: { id: pickupStationId, isActive: true },
  });
  if (!station) {
    throw new AppError('Pickup station not found or is inactive', 404);
  }
  return {
    deliveryType: 'PICKUP_STATION',
    deliveryAddressId: null,
    pickupStationId: station.id,
    deliveryFeeUgx: 0,
    snapshot: {
      name: station.name,
      district: station.district,
      addressText: station.addressText,
      contactPhone: station.contactPhone,
      operatingHours: station.operatingHours,
    },
  };
}

// ============================================================
// Revalidate cart inside the transaction; returns trusted order lines
// Current Product.priceUgx is ALWAYS authoritative (never CartItem snapshot,
// never client values). Quantities revalidated.
// ============================================================
async function buildOrderLinesFromCart(tx, cartId) {
  const cartItems = await tx.cartItem.findMany({
    where: { cartId },
    include: { product: true },
    orderBy: { createdAt: 'asc' },
  });

  if (cartItems.length === 0) {
    throw new AppError('Your cart is empty', 400);
  }

  const lines = [];
  for (const item of cartItems) {
    const qty = Math.trunc(Number(item.quantity));
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY_PER_LINE) {
      throw new AppError(`Invalid quantity for product ID ${item.productId}`, 400);
    }

    const product = item.product;
    if (!product) {
      throw new AppError(`A product in your cart no longer exists`, 404);
    }
    if (!product.isActive) {
      throw new AppError(`Product '${product.slug}' is no longer available`, 400);
    }

    // Authoritative current price from the products table
    lines.push({
      productId: product.id,
      productName: product.nameEn || product.slug,
      unit: product.unit,
      unitPriceUgx: Math.trunc(product.priceUgx),
      quantity: qty,
    });
  }
  return lines;
}

// ============================================================
// Format order for customer/admin responses
// ============================================================
function formatOrder(order, lang = 'EN', { includeHistory = true } = {}) {
  const normLang = normalizeLanguage(lang);
  const localizedItemName = (item) => {
    if (item.product) {
      const t = resolveTranslation(item.product.translations || [], normLang, item.productName, '');
      return t.name || item.productName;
    }
    return item.productName; // snapshot survives product deletion
  };

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillment: {
      method: order.deliveryType,
      ...(order.deliveryType === 'HOME_DELIVERY'
        ? { addressId: order.deliveryAddressId, address: order.addressSnapshot || null }
        : { pickupStationId: order.pickupStationId, station: order.stationSnapshot || null }),
    },
    pricing: {
      currency: order.currency,
      itemsSubtotalUgx: order.itemsSubtotal,
      deliveryFeeUgx: order.deliveryFee,
      totalUgx: order.totalAmount,
      commitmentUgx: order.commitmentAmount,
      remainingBalanceUgx: order.remainingBalance,
    },
    notes: order.notes || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: (order.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: localizedItemName(item),
      snapshotName: item.productName,
      unit: item.unit,
      quantity: Math.trunc(Number(item.quantity)),
      unitPriceUgx: item.unitPriceUgx,
      lineTotalUgx: item.totalUgx,
    })),
    statusHistory: includeHistory
      ? (order.statusHistory || []).map((h) => ({
          id: h.id,
          fromStatus: h.statusFrom,
          toStatus: h.statusTo,
          changedByType: h.changedByType,
          changedById: h.changedById,
          notes: h.notes,
          createdAt: h.createdAt,
        }))
      : undefined,
    payments: order.payments
      ? order.payments.map((p) => ({
          id: p.id,
          paymentType: p.paymentType,
          provider: p.provider,
          status: p.status,
          amountUgx: p.amountUgx,
          currency: p.currency,
          createdAt: p.createdAt,
        }))
      : undefined,
  };
}

// ============================================================
// CREATE ORDER (single atomic transaction)
// ============================================================
async function createOrderFromCart(userId, { fulfillmentMethod, addressId, pickupStationId, notes = null }) {
  return prisma.$transaction(async (tx) => {
    // 1. Cart must exist and belong to this customer.
    //    The cart row is locked FOR UPDATE *before* its items are read, so cart
    //    consumption is serialized: a concurrent double-click/retry blocks here,
    //    then re-reads an EMPTY cart after the first request commits (400).
    //    Without this lock a retried request could read stale cart items and
    //    create a duplicate order. Lock order (cart -> products) is consistent,
    //    so no deadlock is possible.
    const cartRows = await tx.$queryRaw`
      SELECT id FROM carts WHERE user_id = ${userId}::uuid FOR UPDATE
    `;
    const cart = cartRows[0];
    if (!cart) {
      throw new AppError('Your cart is empty', 400);
    }

    // 2. Fulfillment validation + snapshots + fee (address/station locked to their tables)
    const fulfillment = await resolveFulfillment(tx, userId, {
      fulfillmentMethod,
      addressId,
      pickupStationId,
    });

    // 3. Revalidate cart lines against authoritative product data
    const lines = await buildOrderLinesFromCart(tx, cart.id);

    // 4. Lock product rows and verify stock atomically (oversell protection)
    for (const line of lines) {
      const rows = await tx.$queryRaw`
        SELECT id, stock_quantity AS "stockQuantity", price_ugx AS "priceUgx", is_active AS "isActive"
        FROM products
        WHERE id = ${line.productId}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        throw new AppError(`Product ID ${line.productId} no longer exists`, 404);
      }
      if (!row.isActive) {
        throw new AppError('A product in your cart is no longer available', 400);
      }
      if (row.stockQuantity < line.quantity) {
        throw new AppError(
          `Insufficient stock for product ID ${line.productId}. Available: ${row.stockQuantity}, requested: ${line.quantity}`,
          409
        );
      }
      // Authoritative price re-read under lock
      line.unitPriceUgx = Math.trunc(row.priceUgx);
    }

    // 5. Commitment rule (server config)
    const commitmentRule = await tx.commitmentRuleConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    // 6. Centralized integer UGX calculation
    const amounts = calculateOrderAmounts({
      lines,
      deliveryFeeUgx: fulfillment.deliveryFeeUgx,
      commitmentRule,
    });

    // 7. Collision-resistant order number (unique-checked within tx)
    let orderNumber = generateOrderNumber();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await tx.order.findUnique({ where: { orderNumber } });
      if (!clash) break;
      orderNumber = generateOrderNumber();
    }

    // 8. Create order (permanent snapshot)
    const order = await tx.order.create({
      data: {
        orderNumber,
        userId,
        deliveryType: fulfillment.deliveryType,
        deliveryAddressId: fulfillment.deliveryAddressId,
        pickupStationId: fulfillment.pickupStationId,
        status: 'PENDING_PAYMENT',
        itemsSubtotal: amounts.subtotalUgx,
        deliveryFee: amounts.deliveryFeeUgx,
        totalAmount: amounts.totalUgx,
        commitmentAmount: amounts.commitmentUgx,
        remainingBalance: amounts.remainingBalanceUgx,
        currency: 'UGX',
        notes: notes ? String(notes).slice(0, 1000) : null,
        addressSnapshot: fulfillment.deliveryType === 'HOME_DELIVERY' ? fulfillment.snapshot : undefined,
        stationSnapshot: fulfillment.deliveryType === 'PICKUP_STATION' ? fulfillment.snapshot : undefined,
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            productName: line.productName,
            unit: line.unit,
            unitPriceUgx: line.unitPriceUgx,
            quantity: line.quantity,
            totalUgx: Math.trunc(line.unitPriceUgx) * line.quantity,
          })),
        },
        statusHistory: {
          create: [
            {
              statusFrom: null,
              statusTo: 'PENDING_PAYMENT',
              changedByType: 'CUSTOMER',
              changedById: userId,
              notes: 'Order created from cart',
            },
          ],
        },
      },
      include: { items: true, statusHistory: true },
    });

    // 9. Deduct stock + write inventory history (SALE) — inside same tx
    for (const line of lines) {
      const updated = await tx.product.update({
        where: { id: line.productId },
        data: { stockQuantity: { decrement: line.quantity } },
        select: { stockQuantity: true },
      });
      if (updated.stockQuantity < 0) {
        // Defensive: guarded by FOR UPDATE above, never expected
        throw new AppError(`Stock conflict for product ID ${line.productId}`, 409);
      }
      await tx.inventoryTransaction.create({
        data: {
          productId: line.productId,
          quantityChange: -line.quantity,
          previousQuantity: updated.stockQuantity + line.quantity,
          newQuantity: updated.stockQuantity,
          type: 'SALE',
          reason: `Order ${orderNumber}`,
          referenceId: order.id,
          createdBy: null, // customer-driven sale
        },
      });
    }

    // 10. Clear THIS customer's cart (cart record retained: one cart per user)
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    // 11. Phase 7: create the fulfillment record (exactly one per order —
    // deliveries.order_id is UNIQUE at the DB level). Snapshots come from the
    // order's permanent Phase 5 snapshots. DB-level uniqueness makes retries
    // safe even across processes.
    await createDeliveryForOrder(tx, order);

    return order;
  });
}

// ============================================================
// CUSTOMER: list own orders (paginated, filterable)
// ============================================================
async function listCustomerOrders(userId, { page = 1, limit = 10, status = null } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const where = { userId };
  if (status) {
    const statuses = String(status)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => ORDER_STATUS_TRANSITIONS[s] !== undefined);
    if (statuses.length > 0) where.status = { in: statuses };
  }

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
      include: { items: true },
    }),
  ]);

  return {
    items: orders.map((o) => formatOrder(o, 'EN', { includeHistory: false })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

// ============================================================
// CUSTOMER: own order detail (ownership-enforced)
// ============================================================
async function getCustomerOrder(userId, orderId, lang = 'EN') {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId }, // IDOR-safe
    include: {
      items: { include: { product: { include: { translations: true } } } },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      payments: true,
    },
  });
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  return formatOrder(order, lang);
}

// ============================================================
// CUSTOMER: cancel own order (status-gated, restores stock once)
// ============================================================
async function cancelCustomerOrder(userId, orderId, reason = null) {
  return prisma.$transaction(async (tx) => {
    // Lock the order row: concurrent cancel/admin-transition serializes here
    const rows = await tx.$queryRaw`
      SELECT id, status, "user_id" AS "userId"
      FROM orders
      WHERE id = ${orderId}::uuid
      FOR UPDATE
    `;
    const order = rows[0];
    if (!order || order.userId !== userId) {
      throw new AppError('Order not found', 404);
    }

    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
      throw new AppError(`Order cannot be cancelled in status ${order.status}`, 409);
    }

    // Restore stock exactly once (order moves to CANCELLED, a terminal state)
    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
      const updated = await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: Math.trunc(Number(item.quantity)) } },
        select: { stockQuantity: true },
      });
      await tx.inventoryTransaction.create({
        data: {
          productId: item.productId,
          quantityChange: Math.trunc(Number(item.quantity)),
          previousQuantity: updated.stockQuantity - Math.trunc(Number(item.quantity)),
          newQuantity: updated.stockQuantity,
          type: 'RETURN',
          reason: `Order ${order.orderNumber || ''} cancelled${reason ? `: ${String(reason).slice(0, 200)}` : ''}`.trim(),
          referenceId: orderId,
          createdBy: null,
        },
      });
    }

    const cancelled = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        statusHistory: {
          create: [
            {
              statusFrom: order.status,
              statusTo: 'CANCELLED',
              changedByType: 'CUSTOMER',
              changedById: userId,
              notes: reason ? String(reason).slice(0, 500) : 'Cancelled by customer',
            },
          ],
        },
      },
      include: { items: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });

    // Phase 7: operationally deactivate the fulfillment (DELIVERED/PICKED_UP
    // already-terminal deliveries are left untouched — money/history intact;
    // Phase 5 cancellation rules themselves gate which orders can be cancelled).
    await cancelDeliveryForOrder(tx, orderId, reason);

    return cancelled;
  });
}

// ============================================================
// ADMIN: list orders (paginated, filtered, searchable)
// ============================================================
async function listAdminOrders({ page = 1, limit = 20, status = null, fulfillmentMethod = null, search = null } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where = {};
  if (status) {
    const statuses = String(status)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => ORDER_STATUS_TRANSITIONS[s] !== undefined);
    if (statuses.length > 0) where.status = { in: statuses };
  }
  if (fulfillmentMethod === 'HOME_DELIVERY' || fulfillmentMethod === 'PICKUP_STATION') {
    where.deliveryType = fulfillmentMethod;
  }
  if (search && String(search).trim().length > 0) {
    const q = String(search).trim();
    where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { user: { phone: { contains: q } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
      include: {
        items: true,
        user: {
          select: { id: true, fullName: true, phone: true, email: true }, // never passwordHash
        },
      },
    }),
  ]);

  return {
    items: orders.map((o) => ({
      ...formatOrder(o, 'EN', { includeHistory: false }),
      customer: o.user,
    })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

// ============================================================
// ADMIN: order detail
// ============================================================
async function getAdminOrder(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { include: { translations: true } } } },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      payments: true,
      user: { select: { id: true, fullName: true, phone: true, email: true } },
    },
  });
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  return { ...formatOrder(order), customer: order.user };
}

// ============================================================
// CENTRAL ORDER STATUS TRANSITION (single source of transition truth)
// Used by BOTH the admin status endpoint and the Phase 6 payment service.
// Locks the order row, validates against ORDER_STATUS_TRANSITIONS, writes the
// status + exactly one history entry. Callers own side effects (stock
// restoration, audit) and the enclosing transaction.
// Returns { previousStatus, orderNumber, updatedOrder }.
// ============================================================
async function applyOrderStatusTransition(tx, { orderId, toStatus, changedByType = 'ADMIN', changedById = null, notes = null }) {
  const rows = await tx.$queryRaw`
    SELECT id, status, "order_number" AS "orderNumber"
    FROM orders
    WHERE id = ${orderId}::uuid
    FOR UPDATE
  `;
  const order = rows[0];
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const allowed = ORDER_STATUS_TRANSITIONS[order.status] || [];
  if (!allowed.includes(toStatus)) {
    throw new AppError(`Invalid status transition: ${order.status} → ${toStatus}`, 409);
  }

  const updatedOrder = await tx.order.update({
    where: { id: orderId },
    data: {
      status: toStatus,
      statusHistory: {
        create: [
          {
            statusFrom: order.status,
            statusTo: toStatus,
            changedByType,
            changedById: changedById || null,
            notes: notes ? String(notes).slice(0, 500) : null,
          },
        ],
      },
    },
    include: { items: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
  });

  return { previousStatus: order.status, orderNumber: order.orderNumber, updatedOrder };
}

// ============================================================
// ADMIN: status transition (map-validated, audited, restores stock on cancel)
// ============================================================
async function adminUpdateOrderStatus({ orderId, toStatus, admin, reason = null, ipAddress = null }) {
  return prisma.$transaction(async (tx) => {
    const { previousStatus, orderNumber, updatedOrder } = await applyOrderStatusTransition(tx, {
      orderId,
      toStatus,
      changedByType: 'ADMIN',
      changedById: admin.id,
      notes: reason ? String(reason).slice(0, 500) : `Changed by ${admin.role}`,
    });

    // Phase 7: keep the fulfillment record consistent with the order move
    // (READY/OUT/DELIVERED/PICKED_UP/FAILED/CANCELLED sync; no-op for purely
    // financial states). Uses the same central delivery transition.
    await syncDeliveryForOrderTransition(tx, {
      orderId,
      toStatus,
      changedById: admin.id,
      failureMessage: reason ? String(reason).slice(0, 500) : null,
    });

    // Cancellation via admin transition must also restore stock exactly once
    if (toStatus === 'CANCELLED') {
      const items = await tx.orderItem.findMany({ where: { orderId } });
      for (const item of items) {
        const qty = Math.trunc(Number(item.quantity));
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: qty } },
          select: { stockQuantity: true },
        });
        await tx.inventoryTransaction.create({
          data: {
            productId: item.productId,
            quantityChange: qty,
            previousQuantity: updated.stockQuantity - qty,
            newQuantity: updated.stockQuantity,
            type: 'RETURN',
            reason: `Order ${orderNumber} cancelled by admin`,
            referenceId: orderId,
            createdBy: admin.id,
          },
        });
      }
    }

    await logAudit({
      adminId: admin.id,
      action: `ORDER_STATUS_${toStatus}`,
      entityName: 'Order',
      entityId: orderId,
      details: { orderNumber, fromStatus: previousStatus, toStatus, reason },
      ipAddress,
    });

    return updatedOrder;
  });
}

module.exports = {
  generateOrderNumber,
  calculateOrderAmounts,
  createOrderFromCart,
  listCustomerOrders,
  getCustomerOrder,
  cancelCustomerOrder,
  listAdminOrders,
  getAdminOrder,
  adminUpdateOrderStatus,
  applyOrderStatusTransition,
  formatOrder,
};
