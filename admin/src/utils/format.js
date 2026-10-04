/**
 * Display formatting helpers shared by all admin pages.
 * Money is always integer UGX (never floating point); statuses render as
 * human-readable labels with a semantic tone used consistently app-wide.
 */

/** Format integer UGX: formatUGX(25000) -> "UGX 25,000" */
export function formatUGX(amount) {
  const intVal = Math.round(Number(amount) || 0);
  return `UGX ${intVal.toLocaleString('en-UG')}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

export function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(value);
  }
}

/** Semantic tone map: SUCCESS/PAID/COMPLETED -> success; FAILED/CANCELLED -> danger; etc. */
const ORDER_STATUS_META = {
  PENDING_PAYMENT: { label: 'Pending Payment', tone: 'warning' },
  COMMITMENT_PAID: { label: 'Commitment Paid', tone: 'success' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  PREPARING: { label: 'Preparing', tone: 'info' },
  READY_FOR_DELIVERY: { label: 'Ready for Delivery', tone: 'info' },
  READY_FOR_PICKUP: { label: 'Ready for Pickup', tone: 'info' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', tone: 'warning' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  PICKED_UP: { label: 'Picked Up', tone: 'success' },
  BALANCE_PAID: { label: 'Balance Paid', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  PAYMENT_FAILED: { label: 'Payment Failed', tone: 'danger' },
  DELIVERY_FAILED: { label: 'Delivery Failed', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
};

const DELIVERY_STATUS_META = {
  PENDING: { label: 'Pending', tone: 'warning' },
  ASSIGNED: { label: 'Assigned', tone: 'info' },
  READY: { label: 'Ready', tone: 'info' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', tone: 'warning' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  PICKED_UP: { label: 'Picked Up', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

const PAYMENT_STATUS_META = {
  PENDING: { label: 'Pending', tone: 'warning' },
  PROCESSING: { label: 'Processing', tone: 'warning' },
  SUCCESS: { label: 'Success', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

export function getOrderStatusMeta(status) {
  return ORDER_STATUS_META[status] || { label: status || '—', tone: 'neutral' };
}

export function getDeliveryStatusMeta(status) {
  return DELIVERY_STATUS_META[status] || { label: status || '—', tone: 'neutral' };
}

export function getPaymentStatusMeta(status) {
  return PAYMENT_STATUS_META[status] || { label: status || '—', tone: 'neutral' };
}

/** Readable role labels for the admin chrome. */
export function formatRole(role) {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'ADMIN':
      return 'Administrator';
    case 'DISPATCHER':
      return 'Dispatcher';
    default:
      return role || '—';
  }
}

/** "just now", "5 min ago", "3 h ago", then a date. */
export function formatRelative(value) {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return formatDateTime(value);
}

const BOOKING_STATUS_META = {
  PENDING: { label: 'New request', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  ASSIGNED: { label: 'Technician assigned', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export function getBookingStatusMeta(status) {
  return BOOKING_STATUS_META[status] || { label: status || 'Unknown', tone: 'neutral' };
}

export const BOOKING_STATUSES = Object.keys(BOOKING_STATUS_META);

/** Google Maps directions link to a point (opens the app on phones). */
export function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function formatKm(km) {
  return km == null ? '—' : `${Number(km).toFixed(1)} km`;
}

export function formatMinutes(min) {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}
