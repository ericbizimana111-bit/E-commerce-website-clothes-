import { getOrderStatusMeta, getDeliveryStatusMeta, getPaymentStatusMeta, getBookingStatusMeta } from '../../utils/format';

/**
 * Semantic status pill. Tone classes come from the shared status metadata so
 * the same status always renders with the same color across the console.
 */
export default function StatusBadge({ status, kind = 'order' }) {
  const meta =
    kind === 'delivery'
      ? getDeliveryStatusMeta(status)
      : kind === 'booking'
        ? getBookingStatusMeta(status)
        : kind === 'payment'
          ? getPaymentStatusMeta(status)
          : getOrderStatusMeta(status);
  return <span className={`badge badge--${meta.tone}`}>{meta.label}</span>;
}
