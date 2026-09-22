/**
 * Customer-friendly status presentation. Labels come from the translation
 * dictionaries (`status_*`, `pay_*`, `delivery_*`) so raw enum values never
 * reach the screen in any language; only the badge tone lives here.
 */
const ORDER_TONES = {
  PENDING_PAYMENT: 'warning',
  COMMITMENT_PAID: 'success',
  CONFIRMED: 'success',
  PREPARING: 'info',
  READY_FOR_DELIVERY: 'info',
  READY_FOR_PICKUP: 'success',
  OUT_FOR_DELIVERY: 'warning',
  DELIVERED: 'success',
  PICKED_UP: 'success',
  BALANCE_PAID: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  PAYMENT_FAILED: 'danger',
  REFUNDED: 'neutral',
  DELIVERY_FAILED: 'danger'
};

const PAYMENT_TONES = {
  PENDING: 'warning',
  PROCESSING: 'warning',
  SUCCESS: 'success',
  FAILED: 'danger',
  EXPIRED: 'danger',
  CANCELLED: 'neutral'
};

const labelOrFallback = (t, key, fallback) => {
  const text = t(key);
  return text === key ? fallback : text;
};

export function orderStatusMeta(status, t) {
  return { label: labelOrFallback(t, `status_${status}`, status), tone: ORDER_TONES[status] || 'neutral' };
}

export function paymentStatusMeta(status, t) {
  return { label: labelOrFallback(t, `pay_${status}`, status), tone: PAYMENT_TONES[status] || 'neutral' };
}

export function deliveryStatusLabel(status, t) {
  return labelOrFallback(t, `delivery_${status}`, status);
}

/** Position of an order along the six-step customer timeline (-1 = cancelled). */
export function lifecycleIndex(status) {
  switch (status) {
    case 'PENDING_PAYMENT':
      return 0;
    case 'COMMITMENT_PAID':
    case 'CONFIRMED':
      return 1;
    case 'PREPARING':
    case 'READY_FOR_DELIVERY':
    case 'READY_FOR_PICKUP':
      return 2;
    case 'OUT_FOR_DELIVERY':
      return 3;
    case 'DELIVERED':
    case 'PICKED_UP':
      return 4;
    case 'BALANCE_PAID':
    case 'COMPLETED':
      return 5;
    default:
      return -1;
  }
}
