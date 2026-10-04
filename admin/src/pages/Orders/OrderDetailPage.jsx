import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, ExternalLink, History, Landmark, MapPin, MessageCircle, Phone, RefreshCw, Route, Timer, TriangleAlert, Wallet } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import AdminMap from '../../components/map/AdminMap';
import { useRealtimeEvent } from '../../context/RealtimeContext';
import { directionsUrl, formatUGX, formatDateTime, formatKm, formatMinutes } from '../../utils/format';
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
  const [route, setRoute] = useState(null);
  const [routeError, setRouteError] = useState(null);
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

  // Road route from the dispatch point (distance, ETA, polyline, tariff check).
  useEffect(() => {
    setRoute(null);
    setRouteError(null);
    api
      .get(`/admin/orders/${id}/route`)
      .then((res) => setRoute(res?.data?.route || null))
      .catch((err) => setRouteError(err.message || 'Route unavailable.'));
  }, [id]);

  // Payments/cancellations for this order arrive live.
  useRealtimeEvent('notification', (n) => {
    if (n.orderId === id) load();
  });

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
  // Delivery orders never offer the legacy pickup branch.
  const suggestions = (SUGGESTED_NEXT[order.status] || []).filter((s) => (isHome ? s !== 'READY_FOR_PICKUP' : s !== 'READY_FOR_DELIVERY'));
  const addr = order.fulfillment?.address || {};
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
                    <td data-label="Product">
                      {item.productName}
                      {item.unit && <div className="order-items-table__unit">per {item.unit}</div>}
                    </td>
                    <td data-label="Unit Price">{formatUGX(item.unitPriceUgx)}</td>
                    <td data-label="Qty">{item.quantity}</td>
                    <td data-label="Line Total">{formatUGX(item.lineTotalUgx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="subtle-note">
              Item names and prices are immutable snapshots taken at order time.
            </p>
          </section>

          <section className="panel panel-pad detail-block" aria-label="Fulfillment">
            <h3>{isHome ? 'Delivery location' : 'Pickup station (legacy order)'}</h3>
            {isHome ? (
              <>
                <div className="deliver-to">
                  <div className="deliver-to__main">
                    <strong>
                      <MapPin size={15} aria-hidden="true" /> {[addr.division, addr.district].filter(Boolean).join(', ') || addr.district}
                      {addr.region && <span className="text-muted"> · {addr.region.toLowerCase()} region</span>}
                    </strong>
                    <p>{addr.streetAddress}</p>
                    {addr.landmark && (
                      <p className="deliver-to__line">
                        <Landmark size={14} aria-hidden="true" /> {addr.landmark}
                      </p>
                    )}
                    {addr.formattedAddress && <p className="text-muted deliver-to__formatted">{addr.formattedAddress}</p>}
                    <div className="deliver-to__badges">
                      {addr.isVerified ? (
                        <span className="badge badge--success">
                          <BadgeCheck size={12} aria-hidden="true" /> Location verified on map
                        </span>
                      ) : addr.latitude != null ? (
                        <span className="badge badge--warning">Pin validated offline — call to confirm</span>
                      ) : (
                        <span className="badge badge--danger">
                          <TriangleAlert size={12} aria-hidden="true" /> No map pin (legacy address)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="deliver-to__contact">
                    <span className="text-muted">Deliver to</span>
                    <strong>{addr.recipientName || order.customer?.fullName}</strong>
                    {(addr.contactPhone || order.customer?.phone) && (
                      <a href={`tel:${addr.contactPhone || order.customer?.phone}`} className="btn btn--secondary btn--sm">
                        <Phone size={13} aria-hidden="true" /> {addr.contactPhone || order.customer?.phone}
                      </a>
                    )}
                    {addr.latitude != null && (
                      <a href={directionsUrl(addr.latitude, addr.longitude)} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">
                        <ExternalLink size={13} aria-hidden="true" /> Open directions
                      </a>
                    )}
                  </div>
                </div>

                {route ? (
                  <>
                    <AdminMap origin={route.origin} destination={route.destination} geometry={route.geometry} height={320} />
                    <div className="route-summary">
                      <div>
                        <Route size={16} aria-hidden="true" />
                        <span>
                          <small>Road distance</small>
                          <strong>{formatKm(route.distanceKm)}</strong>
                        </span>
                      </div>
                      <div>
                        <Timer size={16} aria-hidden="true" />
                        <span>
                          <small>Travel time</small>
                          <strong>{formatMinutes(route.etaMinutes)}</strong>
                        </span>
                      </div>
                      <div>
                        <MapPin size={16} aria-hidden="true" />
                        <span>
                          <small>Straight line</small>
                          <strong>{formatKm(route.straightLineKm)}</strong>
                        </span>
                      </div>
                      <div>
                        <Wallet size={16} aria-hidden="true" />
                        <span>
                          <small>Fee charged</small>
                          <strong>{formatUGX(route.chargedFeeUgx)}</strong>
                        </span>
                      </div>
                    </div>
                    <p className="subtle-note">
                      From {route.origin?.name || 'dispatch point'} ·{' '}
                      {route.distanceSource === 'ROUTED' ? 'road route' : 'estimated from straight-line distance'}. Current tariff for this distance:{' '}
                      <strong>{formatUGX(route.currentTariffFeeUgx)}</strong>
                      {route.currentTariffFeeUgx !== route.chargedFeeUgx && ' (tariff or route changed since the order was placed)'}.
                    </p>
                  </>
                ) : (
                  <p className="text-muted">{routeError || 'Calculating route…'}</p>
                )}
              </>
            ) : (
              <div className="fulfillment-box">
                <MapPin size={15} aria-hidden="true" />
                <div>
                  <strong>{order.fulfillment?.station?.name || 'Pickup station'}</strong>
                  <p>
                    {order.fulfillment?.station?.addressText}
                    {order.fulfillment?.station?.district ? `, ${order.fulfillment.station.district}` : ''}
                  </p>
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
              <div className="kv-list__row">
                <dt>Previous orders</dt>
                <dd>{order.customer?.previousOrders ?? '—'}</dd>
              </div>
            </dl>
            {order.notes && (
              <div className="order-note">
                <strong>Customer note</strong>
                <p>{order.notes}</p>
              </div>
            )}
            <Link to={`/messages?customer=${order.customer?.id}`} className="btn btn--secondary btn--sm btn--block" style={{ marginTop: 10 }}>
              <MessageCircle size={14} aria-hidden="true" /> Message customer
            </Link>
          </section>

          {order.delivery && (
            <section className="panel panel-pad detail-block" aria-label="Dispatch">
              <h3>Dispatch</h3>
              <dl className="kv-list">
                <div className="kv-list__row">
                  <dt>Delivery status</dt>
                  <dd>
                    <StatusBadge status={order.delivery.status} kind="delivery" />
                  </dd>
                </div>
                <div className="kv-list__row">
                  <dt>Assigned to</dt>
                  <dd>{order.delivery.assignedAdmin?.fullName || 'Unassigned'}</dd>
                </div>
                {order.delivery.startedAt && (
                  <div className="kv-list__row">
                    <dt>Dispatched</dt>
                    <dd>{formatDateTime(order.delivery.startedAt)}</dd>
                  </div>
                )}
              </dl>
              <Link to="/deliveries" className="btn btn--ghost btn--sm" style={{ marginTop: 8 }}>
                Manage in Deliveries
              </Link>
            </section>
          )}

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
