import { Bell, CircleAlert, CircleCheck, MessageCircle, PackageX, ShoppingBag, Wallet, Wrench } from 'lucide-react';

/** Icon + human label per staff notification type. */
const TYPES = {
  NEW_ORDER: { icon: ShoppingBag, label: 'New order' },
  PAYMENT_RECEIVED: { icon: Wallet, label: 'Payment received' },
  BALANCE_PAID: { icon: CircleCheck, label: 'Balance paid' },
  PAYMENT_FAILED: { icon: CircleAlert, label: 'Payment failed' },
  ORDER_CANCELLED: { icon: PackageX, label: 'Order cancelled' },
  NEW_MESSAGE: { icon: MessageCircle, label: 'Customer message' },
  NEW_SERVICE_REQUEST: { icon: Wrench, label: 'Service booking' },
  SERVICE_REQUEST_CANCELLED: { icon: Wrench, label: 'Booking cancelled' },
};

export function notificationIcon(type) {
  return TYPES[type]?.icon || Bell;
}

export function notificationLabel(type) {
  return TYPES[type]?.label || 'Update';
}

export const NOTIFICATION_TYPES = Object.keys(TYPES);
