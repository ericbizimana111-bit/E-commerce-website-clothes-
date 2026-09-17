const ORDER_STATUSES = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  COMMITMENT_PAID: 'COMMITMENT_PAID',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  PICKED_UP: 'PICKED_UP',
  BALANCE_PAID: 'BALANCE_PAID',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  REFUNDED: 'REFUNDED',
};

const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  DISPATCHER: 'DISPATCHER',
};

const DELIVERY_TYPES = {
  HOME_DELIVERY: 'HOME_DELIVERY',
  PICKUP_STATION: 'PICKUP_STATION',
};

const PAYMENT_TYPES = {
  COMMITMENT_ONLINE: 'COMMITMENT_ONLINE',
  REMAINING_CASH: 'REMAINING_CASH',
};

const PAYMENT_PROVIDERS = {
  MOCK: 'MOCK',
  FLUTTERWAVE: 'FLUTTERWAVE',
  MTN_MOMO: 'MTN_MOMO',
  AIRTEL_MONEY: 'AIRTEL_MONEY',
  CASH: 'CASH',
};

const FOOD_UNITS = [
  'kg',
  'bunch',
  'crate',
  'litre',
  'piece',
  'pack',
  'sack',
  'basket',
];

/**
 * Delivery/fulfillment status values (Phase 7).
 * Internal delivery lifecycle, distinct from the order lifecycle.
 */
const DELIVERY_STATUSES = {
  PENDING: 'PENDING',
  ASSIGNED: 'ASSIGNED',
  READY: 'READY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  PICKED_UP: 'PICKED_UP',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

/**
 * Centralized, server-controlled delivery status transition map.
 * HOME_DELIVERY and PICKUP_STATION branches are guarded separately
 * (see DELIVERY_TYPE_ALLOWED_STATUSES) — e.g. pickup never enters
 * ASSIGNED/OUT_FOR_DELIVERY, home delivery never reaches PICKED_UP.
 * Terminal states (DELIVERED, PICKED_UP, CANCELLED) have no exits.
 */
const DELIVERY_STATUS_TRANSITIONS = {
  PENDING: ['ASSIGNED', 'READY', 'CANCELLED'],
  ASSIGNED: ['READY', 'CANCELLED'],
  // READY -> FAILED: PICKUP only (station issue); home deliveries must
  // dispatch first — enforced in applyDeliveryStatusTransition.
  READY: ['OUT_FOR_DELIVERY', 'PICKED_UP', 'FAILED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  // FAILED -> OUT_FOR_DELIVERY mirrors the Phase 5 order map's
  // DELIVERY_FAILED -> OUT_FOR_DELIVERY re-dispatch path.
  FAILED: ['OUT_FOR_DELIVERY'],
  DELIVERED: [],
  PICKED_UP: [],
  CANCELLED: [],
};

/**
 * Which delivery statuses each fulfillment type may use.
 */
const DELIVERY_TYPE_ALLOWED_STATUSES = {
  HOME_DELIVERY: [
    'PENDING',
    'ASSIGNED',
    'READY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'FAILED',
    'CANCELLED',
  ],
  PICKUP_STATION: ['PENDING', 'READY', 'PICKED_UP', 'CANCELLED'],
};

/**
 * Controlled failure reasons for FAILED deliveries.
 */
const DELIVERY_FAILURE_REASONS = [
  'CUSTOMER_UNAVAILABLE',
  'INVALID_ADDRESS',
  'DRIVER_UNABLE_TO_COMPLETE',
  'PICKUP_STATION_ISSUE',
  'OTHER',
];

/**
 * Order status -> required/expected delivery status sync map (Phase 7).
 * When an order transition happens, the delivery row is kept consistent.
 * Value = the delivery status the delivery MUST have after the order move.
 * null = the delivery is cancelled/terminal-inactive for that order state.
 */
const ORDER_TO_DELIVERY_SYNC = {
  CONFIRMED: 'PENDING',
  PREPARING: 'PENDING',
  READY_FOR_DELIVERY: 'READY',
  READY_FOR_PICKUP: 'READY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  PICKED_UP: 'PICKED_UP',
};

/**
 * Delivery statuses that are operationally terminal — no reassignment, no
 * further transitions. FAILED is deliberately NOT terminal: it supports the
 * Phase 5 re-dispatch path (FAILED -> OUT_FOR_DELIVERY).
 */
const DELIVERY_TERMINAL_STATUSES = ['DELIVERED', 'PICKED_UP', 'CANCELLED'];

/**
 * Delivery statuses from which an order cancellation may still cancel the delivery.
 */
const DELIVERY_CANCELLABLE_STATUSES = ['PENDING', 'ASSIGNED', 'READY'];

/**
 * Centralized, server-controlled order status transition map.
 * Clients (customers AND admins) may never set statuses arbitrarily:
 * every transition must appear as a value in this map.
 * Terminal states (COMPLETED, CANCELLED, REFUNDED) intentionally have no exits.
 */
const ORDER_STATUS_TRANSITIONS = {
  PENDING_PAYMENT: ['COMMITMENT_PAID', 'CANCELLED', 'PAYMENT_FAILED'],
  COMMITMENT_PAID: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_DELIVERY', 'READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_DELIVERY: ['OUT_FOR_DELIVERY'],
  READY_FOR_PICKUP: ['PICKED_UP'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED: ['BALANCE_PAID'],
  PICKED_UP: ['BALANCE_PAID'],
  BALANCE_PAID: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  PAYMENT_FAILED: ['CANCELLED', 'PENDING_PAYMENT'],
  DELIVERY_FAILED: ['REFUNDED', 'OUT_FOR_DELIVERY'],
  REFUNDED: [],
};

/**
 * Statuses from which a CUSTOMER may cancel their own order.
 * Admins use the full transition map (CANCELLED is reachable from more states).
 */
const CUSTOMER_CANCELLABLE_STATUSES = ['PENDING_PAYMENT', 'COMMITMENT_PAID', 'CONFIRMED'];

/**
 * Customer-facing order statuses (admin-only operational states are excluded)
 */
const CUSTOMER_VISIBLE_STATUSES = [
  'PENDING_PAYMENT',
  'COMMITMENT_PAID',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_DELIVERY',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PICKED_UP',
  'BALANCE_PAID',
  'COMPLETED',
  'CANCELLED',
];

module.exports = {
  ORDER_STATUSES,
  ROLES,
  DELIVERY_TYPES,
  DELIVERY_STATUSES,
  DELIVERY_STATUS_TRANSITIONS,
  DELIVERY_TYPE_ALLOWED_STATUSES,
  DELIVERY_FAILURE_REASONS,
  ORDER_TO_DELIVERY_SYNC,
  DELIVERY_TERMINAL_STATUSES,
  DELIVERY_CANCELLABLE_STATUSES,
  PAYMENT_TYPES,
  PAYMENT_PROVIDERS,
  FOOD_UNITS,
  ORDER_STATUS_TRANSITIONS,
  CUSTOMER_CANCELLABLE_STATUSES,
  CUSTOMER_VISIBLE_STATUSES,
};
