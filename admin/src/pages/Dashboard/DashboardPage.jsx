import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Package,
  ShoppingBag,
  Truck,
  Wallet,
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatUGX, formatDateTime } from '../../utils/format';
import StatusBadge from '../../components/ui/StatusBadge';
import { CardSkeleton, TableSkeleton } from '../../components/ui/loaders';
import { ErrorState } from '../../components/ui/states';
import './DashboardPage.css';

/**
 * Delivery statuses that count as "active" for the Active Deliveries KPI.
 * The backend's GET /api/admin/deliveries accepts exactly ONE status value
 * per request (zod single-value enum — comma lists are rejected with 400),
 * so each status is requested separately and the results are combined.
 */
const ACTIVE_DELIVERY_STATUSES = ['PENDING', 'ASSIGNED', 'READY', 'OUT_FOR_DELIVERY'];

/** Sum of pagination totals across same-shape list responses. The deliveries
 *  endpoint nests its list under `data` ({ success, data: { items, pagination } })
 *  while orders/products spread items/pagination at the top level — handle both. */
function sumTotals(responses) {
  return responses.reduce(
    (sum, r) => sum + (r?.data?.pagination?.total ?? r?.pagination?.total ?? 0),
    0,
  );
}

/**
 * Operational dashboard — every value is computed from real backend data
 * returned by existing admin endpoints (orders, deliveries, products).
 * No fabricated analytics: where the backend offers no historical series,
 * only live operational summaries are shown.
 *
 * Failure isolation: each dashboard feed is wrapped in its own promise so a
 * failure in one feed (e.g. deliveries 400) does not blank the whole page —
 * that section shows an inline error with retry, the rest still render.
 */
export default function DashboardPage() {
  const { admin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedErrors, setFeedErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFeedErrors({});

    // Per-feed isolation: a rejected feed yields `null` + a feed error entry
    // instead of failing the whole dashboard.
    const safe = (promise, key) =>
      promise.catch((err) => {
        setFeedErrors((prev) => ({ ...prev, [key]: err.message || 'Failed to load.' }));
        return null;
      });

    try {
      // Orders backend accepts a comma-separated status list (order.service.js
      // splits on ','); deliveries backend accepts ONE status per request.
      const [allOrders, pendingPay, dPending, dAssigned, dReady, dOut, lowStockRes] =
        await Promise.all([
          api.get('/admin/orders?page=1&limit=1'),
          api.get('/admin/orders?page=1&limit=1&status=PENDING_PAYMENT,PAYMENT_FAILED'),
          ...ACTIVE_DELIVERY_STATUSES.map((status) =>
            safe(api.get(`/admin/deliveries?page=1&limit=50&status=${status}`), `deliveries:${status}`),
          ),
          safe(api.get('/admin/catalog/products?page=1&limit=50&inStock=false'), 'lowStock'),
        ]);

      const recentOrders = await api.get('/admin/orders?page=1&limit=8').catch(() => null);

      // Failure of an unprotected feed (orders counts) blanks the whole page;
      // everything else degrades per-section instead.
      if (!allOrders || !pendingPay) {
        throw new Error('Unable to load order statistics.');
      }

      setData({
        totalOrders: allOrders?.pagination?.total ?? 0,
        awaitingPayment: pendingPay?.pagination?.total ?? 0,
        activeDeliveries: sumTotals([dPending, dAssigned, dReady, dOut]),
        lowStock: lowStockRes,
        lowStockItems: lowStockRes?.items?.slice(0, 5) || [],
        recentOrders: recentOrders?.items || [],
      });
    } catch (err) {
      setError(err.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = admin?.fullName?.split(' ')[0] || 'Admin';

  // All derived values guard against null/undefined — a partial feed failure
  // must degrade that section, never crash the page.
  const totalOrders = data?.totalOrders ?? 0;
  const awaitingPayment = data?.awaitingPayment ?? 0;
  const activeDeliveries = data?.activeDeliveries ?? 0;
  const lowStock = data?.lowStock;
  const lowStockCount = lowStock?.pagination?.total ?? 0;
  const lowStockItems = lowStock?.items?.slice(0, 5) || [];
  const recentOrders = data?.recentOrders || [];

  const kpis = loading
    ? null
    : [
        {
          label: 'Total Orders',
          value: totalOrders.toLocaleString('en-UG'),
          hint: 'All-time orders',
          icon: ShoppingBag,
          tone: 'primary',
        },
        {
          label: 'Awaiting Payment',
          value: awaitingPayment.toLocaleString('en-UG'),
          hint: 'Pending or failed commitment',
          icon: Wallet,
          tone: 'warning',
        },
        {
          label: 'Active Deliveries',
          value: activeDeliveries.toLocaleString('en-UG'),
          hint: 'Pending through out-for-delivery',
          icon: Truck,
          tone: 'info',
        },
        {
          label: 'Out of Stock',
          value: lowStockCount.toLocaleString('en-UG'),
          hint: 'Products needing restock',
          icon: Package,
          tone: lowStockCount > 0 ? 'danger' : 'success',
        },
      ];

  return (
    <div>
      <div className="dash-greeting">
        <h1>
          {greeting}, {firstName}
        </h1>
        <p>Operational overview across UgaMarket commerce and fulfillment.</p>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          {loading ? (
            <CardSkeleton count={4} />
          ) : (
            <div className="kpi-grid">
              {kpis.map((kpi) => (
                <div key={kpi.label} className="kpi-card">
                  <span className={`kpi-card__icon kpi-card__icon--${kpi.tone}`}>
                    <kpi.icon size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <div className="kpi-card__label">{kpi.label}</div>
                    <div className="kpi-card__value">{kpi.value}</div>
                    <div className="kpi-card__hint">{kpi.hint}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="section-grid">
            <section aria-label="Recent orders">
              <div className="section-title">Recent Orders</div>
              {loading ? (
                <TableSkeleton rows={6} columns={5} />
              ) : recentOrders.length === 0 ? (
                <div className="panel panel-pad text-muted">No orders have been placed yet.</div>
              ) : (
                <div className="panel">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th scope="col">Order</th>
                        <th scope="col">Customer</th>
                        <th scope="col">Total</th>
                        <th scope="col">Status</th>
                        <th scope="col" aria-label="Open" />
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <Link to={`/orders/${order.id}`} className="mono">
                              {order.orderNumber}
                            </Link>
                            <div className="dash-table__sub">{formatDateTime(order.createdAt)}</div>
                          </td>
                          <td>{order.customer?.fullName || '—'}</td>
                          <td>{formatUGX(order.pricing?.totalUgx)}</td>
                          <td>
                            <StatusBadge status={order.status} />
                          </td>
                          <td>
                            <Link
                              to={`/orders/${order.id}`}
                              className="dash-table__open"
                              aria-label={`Open order ${order.orderNumber}`}
                            >
                              <ArrowRight size={15} aria-hidden="true" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-label="Operational alerts">
              <div className="section-title">Operational Alerts</div>
              {loading ? (
                <CardSkeleton count={1} />
              ) : feedErrors['deliveries:PENDING'] || feedErrors['deliveries:ASSIGNED'] || feedErrors['deliveries:READY'] || feedErrors['deliveries:OUT_FOR_DELIVERY'] ? (
                <div className="panel panel-pad">
                  <ErrorState
                    message="Active delivery data could not be loaded."
                    onRetry={load}
                  />
                </div>
              ) : lowStock === null || feedErrors.lowStock ? (
                <div className="panel panel-pad">
                  <ErrorState message="Stock alert data could not be loaded." onRetry={load} />
                </div>
              ) : (
                <div className="panel panel-pad dash-alerts">
                  {lowStockCount > 0 ? (
                    <>
                      <div className="dash-alert dash-alert--danger">
                        <AlertTriangle size={16} aria-hidden="true" />
                        <div>
                          <strong>{lowStockCount} products out of stock</strong>
                          <ul>
                            {lowStockItems.map((p) => (
                              <li key={p.id}>
                                {p.slug} — {p.stockQuantity} in stock
                              </li>
                            ))}
                          </ul>
                          <Link to="/products?inStock=false">Review products</Link>
                        </div>
                      </div>
                      <div className="dash-alert dash-alert--info">
                        <ClipboardList size={16} aria-hidden="true" />
                        <span>Restock or adjust inventory from the Inventory page.</span>
                      </div>
                    </>
                  ) : (
                    <div className="dash-alert dash-alert--success">
                      <Package size={16} aria-hidden="true" />
                      <span>All products have stock available.</span>
                    </div>
                  )}
                  {awaitingPayment > 0 && (
                    <div className="dash-alert dash-alert--warning">
                      <Wallet size={16} aria-hidden="true" />
                      <span>
                        {awaitingPayment} order
                        {awaitingPayment === 1 ? '' : 's'} waiting for commitment payment.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
