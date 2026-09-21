import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Wallet } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import { formatUGX, formatDateTime, getPaymentStatusMeta } from '../../utils/format';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/states';
import './PaymentsPage.css';

/**
 * Payment visibility (read-only).
 * The backend exposes payment data per order (GET /api/admin/orders/:id/payment)
 * and there is no admin endpoint listing all payments. The honest integration
 * is therefore lookup-by-order-number — no fabricated ledger, no refund
 * actions (the backend has no refund endpoint), no payment mutations.
 */
const TONE_CLASS = {
  success: 'badge--success',
  warning: 'badge--warning',
  info: 'badge--info',
  danger: 'badge--danger',
  neutral: 'badge--neutral',
};

export default function PaymentsPage() {
  const { showToast } = useToast();
  const [orderNumber, setOrderNumber] = useState('');
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null); // { orderId, orderNumber }
  const [payment, setPayment] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(false);

  const lookup = async (e) => {
    e.preventDefault();
    const q = orderNumber.trim();
    if (!q) return;
    setLookingUp(true);
    setSelected(null);
    setPayment(null);
    try {
      // GET /api/admin/orders?search=<orderNumber> (search matches orderNumber/phone/email)
      const res = await api.get(`/admin/orders?page=1&limit=10&search=${encodeURIComponent(q)}`);
      const items = Array.isArray(res?.items) ? res.items : [];
      setOrders(items);
      if (items.length === 0) {
        showToast('No orders matched that search.', { type: 'info' });
      }
    } catch (err) {
      showToast(err.message || 'Lookup failed.', { type: 'error' });
    } finally {
      setLookingUp(false);
    }
  };

  const openPayment = async (order) => {
    setSelected(order);
    setLoadingPayment(true);
    try {
      // GET /api/admin/orders/:id/payment -> { data: {...} }
      const res = await api.get(`/admin/orders/${order.id}/payment`);
      setPayment(res?.data || null);
    } catch (err) {
      showToast(err.message || 'Unable to load payment data.', { type: 'error' });
      setPayment(null);
    } finally {
      setLoadingPayment(false);
    }
  };

  const paymentPricing = payment?.pricing || {};

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Server-authoritative payment state per order. Outcomes come only from provider webhooks verified by the backend."
      />

      <div className="panel panel-pad payments-lookup">
        <form className="payments-lookup__form" onSubmit={lookup}>
          <div className="toolbar__search" style={{ maxWidth: 420 }}>
            <Search size={15} aria-hidden="true" />
            <input
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Order number, customer phone, or email"
              aria-label="Search for an order to view payments"
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={lookingUp}>
            <Wallet size={14} aria-hidden="true" />
            {lookingUp ? 'Searching…' : 'Find orders'}
          </button>
        </form>
        <p className="subtle-note">
          Payment records are per-order in the backend; this lookup is the supported access path.
        </p>
      </div>

      {orders.length > 0 && !selected && (
        <div className="panel" style={{ marginTop: 14 }}>
          <table className="payments-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Total</th>
                <th scope="col">Status</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td data-label="Order" className="mono">{o.orderNumber}</td>
                  <td data-label="Customer">{o.customer?.fullName || '—'}</td>
                  <td data-label="Total">{formatUGX(o.pricing?.totalUgx)}</td>
                  <td data-label="Status">
                    <StatusBadge status={o.status} />
                  </td>
                  <td data-label="">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => openPayment(o)}
                    >
                      View payments
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="panel panel-pad payments-detail" style={{ marginTop: 14 }}>
          <div className="payments-detail__head">
            <h3>
              Payments for <span className="mono">{selected.orderNumber}</span>
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to={`/orders/${selected.id}`} className="btn btn--secondary btn--sm">
                Open order
              </Link>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setSelected(null);
                  setPayment(null);
                }}
              >
                Close
              </button>
            </div>
          </div>

          {loadingPayment ? (
            <p className="text-muted">Loading payment data…</p>
          ) : payment ? (
            <>
              <div className="payments-summary">
                <div className="kpi-card">
                  <span className="kpi-card__icon kpi-card__icon--primary">
                    <Wallet size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <div className="kpi-card__label">Order total</div>
                    <div className="kpi-card__value">{formatUGX(paymentPricing.totalUgx)}</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <span className="kpi-card__icon kpi-card__icon--success">
                    <Wallet size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <div className="kpi-card__label">Total paid</div>
                    <div className="kpi-card__value">{formatUGX(paymentPricing.totalPaidUgx)}</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <span
                    className={`kpi-card__icon ${
                      (paymentPricing.remainingBalanceUgx ?? 0) > 0
                        ? 'kpi-card__icon--warning'
                        : 'kpi-card__icon--success'
                    }`}
                  >
                    <Wallet size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <div className="kpi-card__label">Remaining balance</div>
                    <div className="kpi-card__value">
                      {formatUGX(paymentPricing.remainingBalanceUgx)}
                    </div>
                  </div>
                </div>
              </div>

              <h4 className="section-title" style={{ marginTop: 18 }}>
                Payment attempts
              </h4>
              {(payment.payments || []).length === 0 ? (
                <EmptyState
                  title="No payment attempts"
                  message="This order has no recorded payment attempts yet."
                />
              ) : (
                <table className="payments-table">
                  <thead>
                    <tr>
                      <th scope="col">Purpose</th>
                      <th scope="col">Reference</th>
                      <th scope="col">Provider</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payment.payments || []).map((p) => {
                      const meta = getPaymentStatusMeta(p.status);
                      return (
                        <tr key={p.id}>
                          <td data-label="Purpose">{p.purpose === 'BALANCE' ? 'Balance' : 'Commitment'}</td>
                          <td data-label="Reference" className="mono">{p.transactionRef}</td>
                          <td data-label="Provider">{p.provider}</td>
                          <td data-label="Amount">{formatUGX(p.amountUgx)}</td>
                          <td data-label="Status">
                            <span className={`badge ${TONE_CLASS[meta.tone]}`}>{meta.label}</span>
                          </td>
                          <td data-label="Created">{formatDateTime(p.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p className="text-muted">No payment data available for this order.</p>
          )}
        </div>
      )}
    </div>
  );
}
