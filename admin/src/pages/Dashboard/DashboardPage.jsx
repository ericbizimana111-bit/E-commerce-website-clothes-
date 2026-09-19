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
 * Operational dashboard — every value is computed from real backend data
 * returned by existing admin endpoints (orders, deliveries, products).
 * No fabricated analytics: where the backend offers no historical series,
 * only live operational summaries are shown.
 */
export default function DashboardPage() {
  const { admin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch first page of each operational feed (large limit where the
      // backend caps at 50/100) and derive counts from pagination totals
      // plus status filters — all server-computed.
      const [allOrders, pendingPay, activeDeliv, lowStock] = await Promise.all([
        api.get('/admin/orders?page=1&limit=1'),
        api.get('/admin/orders?page=1&limit=1&status=PENDING_PAYMENT,PAYMENT_FAILED'),
        api.get('/admin/deliveries?page=1&limit=50&status=PENDING,ASSIGNED,READY,OUT_FOR_DELIVERY'),
        api.get('/admin/catalog/products?page=1&limit=50&inStock=false'),
      ]);

      const ordersRes = await api.get('/admin/orders?page=1&limit=8');

      setData({
        totalOrders: allOrders?.pagination?.total ?? 0,
        awaitingPayment: pendingPay?.pagination?.total ?? 0,
        activeDeliveries: activeDeliv?.items?.length ?? 0,
        lowStock: lowStock?.pagination?.total ?? 0,
        lowStockItems: lowStock?.items?.slice(0, 5) || [],
        recentOrders: ordersRes?.items || [],
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

  const kpis = loading
    ? null
    : [
        {
          label: 'Total Orders',
          value: data.totalOrders.toLocaleString('en-UG'),
          hint: 'All-time orders',
          icon: ShoppingBag,
          tone: 'primary',
        },
        {
          label: 'Awaiting Payment',
          value: data.awaitingPayment.toLocaleString('en-UG'),
          hint: 'Pending or failed commitment',
          icon: Wallet,
          tone: 'warning',
        },
        {
          label: 'Active Deliveries',
          value: data.activeDeliveries.toLocaleString('en-UG'),
          hint: 'Pending through out-for-delivery',
          icon: Truck,
          tone: 'info',
        },
        {
          label: 'Out of Stock',
          value: data.lowStock.toLocaleString('en-UG'),
          hint: 'Products needing restock',
          icon: Package,
          tone: data.lowStock > 0 ? 'danger' : 'success',
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
              ) : data.recentOrders.length === 0 ? (
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
                      {data.recentOrders.map((order) => (
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
              ) : (
                <div className="panel panel-pad dash-alerts">
                  {data.lowStock > 0 ? (
                    <>
                      <div className="dash-alert dash-alert--danger">
                        <AlertTriangle size={16} aria-hidden="true" />
                        <div>
                          <strong>{data.lowStock} products out of stock</strong>
                          <ul>
                            {data.lowStockItems.map((p) => (
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
                  {data.awaitingPayment > 0 && (
                    <div className="dash-alert dash-alert--warning">
                      <Wallet size={16} aria-hidden="true" />
                      <span>
                        {data.awaitingPayment} order
                        {data.awaitingPayment === 1 ? '' : 's'} waiting for commitment payment.
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
