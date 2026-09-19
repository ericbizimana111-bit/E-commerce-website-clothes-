import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, History, MapPin, RefreshCw, Wallet } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import { formatUGX, formatDateTime } from '../../utils/format';
import StatusBadge from '../../components/ui/StatusBadge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { DetailSkeleton } from '../../components/ui/loaders';
import { ErrorState } from '../../components/ui/states';
import './OrderDetailPage.css';

/**
 * Admin order detail — fully server-authoritative:
 *  - order/items/pricing: GET /api/admin/orders/:id  ({ data: { order } })
 *  - payment breakdown:   GET /api/admin/orders/:id/payment ({ data: {...} })
 *  - status changes:      PATCH /api/admin/orders/:id/status { status, reason }
 * The backend transition map is the only authority; this UI offers valid
 * next statuses and lets the backend accept or reject the move (409 shown).
 */

/** Next-step suggestions per current status (the backend still validates). */
const SUGGESTED_NEXT = {
  COMMITMENT_PAID: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_DELIVERY', 'READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_DELIVERY: ['OUT_FOR_DELIVERY'],
  READY_FOR_PICKUP: ['PICKED_UP'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED: ['BALANCE_PAID'],
  PICKED_UP: ['BALANCE_PAID'],
  BALANCE_PAID: ['COMPLETED'],
  PAYMENT_FAILED: ['CANCELLED', 'PENDING_PAYMENT'],
  DELIVERY_FAILED: ['OUT_FOR_DELIVERY', 'REFUNDED'],
};

const STATUS_LABELS = {
  PENDING_PAYMENT: 'Pending Payment',
  COMMITMENT_PAID: 'Commitment Paid',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY_FOR_DELIVERY: 'Ready for Delivery',
  READY_FOR_PICKUP: 'Ready for Pickup',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  PICKED_UP: 'Picked Up',
  BALANCE_PAID: 'Balance Paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  PAYMENT_FAILED: 'Payment Failed',
  DELIVERY_FAILED: 'Delivery Failed',
  REFUNDED: 'Refunded',
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const { showToast } = useToast();

  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transition, setTransition] = useState(null); // { status }
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderRes, paymentRes] = await Promise.allSettled([
        api.get(`/admin/orders/${id}`),
        api.get(`/admin/orders/${id}/payment`),
      ]);
      if (orderRes.status === 'fulfilled' && orderRes.value?.data?.order) {
        setOrder(orderRes.value.data.order);
      } else {
        throw new Error(
          orderRes.status === 'rejected' ? orderRes.reason?.message : 'Order not found.',
        );
      }
      setPayment(paymentRes.status === 'fulfilled' ? paymentRes.value?.data || null : null);
    } catch (err) {
      setError(err.message || 'Unable to load order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmTransition = async () => {
    if (!transition) return;
    setTransitionBusy(true);
    setActionError(null);
    try {
      // PATCH /api/admin/orders/:id/status — backend enforces the transition map.
      const res = await api.patch(`/admin/orders/${id}/status`, {
        status: transition.status,
        reason: 'Changed via Operations Console',
      });
      showToast(`Order status updated to ${STATUS_LABELS[res?.data?.order?.status] || transition.status}.`, {
        type: 'success',
      });
      setTransition(null);
      await load();
    } catch (err) {
      setActionError(
        err.status === 409
          ? `The backend rejected this transition from the current status (${err.message}).`
          : err.message || 'Status update failed.',
      );
    } finally {
      setTransitionBusy(false);
    }
  };

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error || !order) {
    return (
      <div>
        <Link to="/orders" className="order-back">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to orders
        </Link>
        <ErrorState message={error || 'Order not found.'} onRetry={load} />
      </div>
    );
  }

  const pricing = order.pricing || {};
  const isHome = order.fulfillment?.method === 'HOME_DELIVERY';
  const suggestions = SUGGESTED_NEXT[order.status] || [];
  const terminal = suggestions.length === 0;

  const paymentPricing = payment?.pricing || {};

  return (
    <div>
      <Link to="/orders" className="order-back">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to orders
      </Link>

      <div className="order-detail__header">
        <div>
          <h1 className="mono">{order.orderNumber}</h1>
          <p className="order-detail__meta">
            Placed {formatDateTime(order.createdAt)} ·{' '}
            {isHome ? 'Home Delivery' : 'Pickup Station'}
          </p>
        </div>
        <div className="order-detail__status">
          <StatusBadge status={order.status} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={load}>
            <RefreshCw size={13} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {actionError && (
        <div className="alert alert--error" role="alert" style={{ marginBottom: 14 }}>
          <span>{actionError}</span>
        </div>
      )}

      {/* Status transition actions (backend remains authoritative) */}
      <div className="panel panel-pad order-transition">
        <h3>Order Progression</h3>
        {terminal ? (
          <p className="subtle-note">
            This order is in status <strong>{STATUS_LABELS[order.status]}</strong> — no further
            transitions are available from the console. The backend transition map is
            authoritative.
          </p>
        ) : (
          <>
            <p className="subtle-note" style={{ marginTop: 0 }}>
              Suggested next step{suggestionsCount(suggestions)} based on the current status. The
              backend validates every transition.
            </p>
            <div className="order-actions">
              {suggestions.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`btn btn--sm ${status === 'CANCELLED' ? 'btn--danger' : 'btn--primary'}`}
                  onClick={() => setTransition({ status })}
                  disabled={transitionBusy}
                >
                  Move to {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="detail-grid" style={{ marginTop: 16 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="panel panel-pad detail-block" aria-label="Order items">
            <h3>Items</h3>
            <table className="order-items-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Unit Price</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.productName}
                      {item.unit && <div className="order-items-table__unit">per {item.unit}</div>}
                    </td>
                    <td>{formatUGX(item.unitPriceUgx)}</td>
                    <td>{item.quantity}</td>
                    <td>{formatUGX(item.lineTotalUgx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="subtle-note">
              Item names and prices are immutable snapshots taken at order time.
            </p>
          </section>

          <section className="panel panel-pad detail-block" aria-label="Fulfillment">
            <h3>Fulfillment</h3>
            {isHome ? (
              <div className="fulfillment-box">
                <MapPin size={15} aria-hidden="true" />
                <div>
                  <strong>{order.fulfillment?.address?.title || 'Delivery address'}</strong>
                  <p>
                    {order.fulfillment?.address?.streetAddress}
                    {order.fulfillment?.address?.division
                      ? `, ${order.fulfillment.address.division}`
                      : ''}
                    {order.fulfillment?.address?.district
                      ? `, ${order.fulfillment.address.district}`
                      : ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="fulfillment-box">
                <MapPin size={15} aria-hidden="true" />
                <div>
                  <strong>{order.fulfillment?.station?.name || 'Pickup station'}</strong>
                  <p>
                    {order.fulfillment?.station?.addressText}
                    {order.fulfillment?.station?.district
                      ? `, ${order.fulfillment.station.district}`
                      : ''}
                  </p>
                  {order.fulfillment?.station?.operatingHours && (
                    <p className="order-items-table__unit">{order.fulfillment.station.operatingHours}</p>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="panel panel-pad detail-block" aria-label="Status history">
            <h3>
              <History size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Status History
            </h3>
            {(order.statusHistory || []).length === 0 ? (
              <p className="text-muted">No history recorded.</p>
            ) : (
              <ol className="history-list">
                {(order.statusHistory || []).map((h) => (
                  <li key={h.id}>
                    <span className="history-list__change">
                      {h.fromStatus ? STATUS_LABELS[h.fromStatus] || h.fromStatus : 'Created'}
                      <span aria-hidden="true"> → </span>
                      <strong>{STATUS_LABELS[h.toStatus] || h.toStatus}</strong>
                    </span>
                    <span className="history-list__meta">
                      {formatDateTime(h.createdAt)}
                      {h.changedByType ? ` · ${h.changedByType.toLowerCase()}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="panel panel-pad detail-block" aria-label="Customer">
            <h3>Customer</h3>
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Name</dt>
                <dd>{order.customer?.fullName || '—'}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Phone</dt>
                <dd>{order.customer?.phone || '—'}</dd>
              </div>
              {order.customer?.email && (
                <div className="kv-list__row">
                  <dt>Email</dt>
                  <dd>{order.customer.email}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="panel panel-pad detail-block" aria-label="Pricing">
            <h3>Pricing (server-authoritative)</h3>
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Items subtotal</dt>
                <dd>{formatUGX(pricing.itemsSubtotalUgx)}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Delivery fee</dt>
                <dd>{formatUGX(pricing.deliveryFeeUgx)}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Total</dt>
                <dd>{formatUGX(pricing.totalUgx)}</dd>
              </div>
              <hr className="kv-list__divider" />
              <div className="kv-list__row">
                <dt>Commitment</dt>
                <dd>{formatUGX(pricing.commitmentUgx)}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Remaining balance</dt>
                <dd>{formatUGX(paymentPricing.remainingBalanceUgx ?? pricing.remainingBalanceUgx)}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Total paid</dt>
                <dd>{formatUGX(paymentPricing.totalPaidUgx ?? 0)}</dd>
              </div>
            </dl>
          </section>

          <section className="panel panel-pad detail-block" aria-label="Payments">
            <h3>
              <Wallet size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Payments
            </h3>
            {(payment?.payments || order.payments || []).length === 0 ? (
              <p className="text-muted">No payment attempts recorded.</p>
            ) : (
              <div className="payment-rows">
                {(payment?.payments || order.payments || []).map((p) => (
                  <div key={p.id} className="payment-row">
                    <div>
                      <strong>{p.purpose === 'BALANCE' ? 'Balance' : 'Commitment'}</strong>
                      <small>
                        {p.provider} · <span className="mono">{p.transactionRef}</span>
                      </small>
                    </div>
                    <div className="payment-row__right">
                      {formatUGX(p.amountUgx)}
                      <StatusBadge status={p.status} kind="payment" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="subtle-note">
              Payment outcomes come only from provider webhooks verified server-side.
            </p>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(transition)}
        danger={transition?.status === 'CANCELLED' || transition?.status === 'REFUNDED'}
        title={`Move order to ${transition ? STATUS_LABELS[transition.status] : ''}?`}
        message="This transition is validated and recorded by the UgaMarket backend with an audit entry. Cancelled orders restore stock; some transitions cannot be reversed."
        confirmLabel="Apply transition"
        busy={transitionBusy}
        onConfirm={confirmTransition}
        onCancel={() => setTransition(null)}
      />
    </div>
  );
}

function suggestionsCount(suggestions) {
  return suggestions.length > 1 ? 's' : '';
}
