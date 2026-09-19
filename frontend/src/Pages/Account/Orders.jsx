import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';
import { formatUGX } from '../../utils/currency';
import './Orders.css';

const STATUS_BADGES = {
  PENDING_PAYMENT: { label: 'Awaiting Commitment Deposit', type: 'warning' },
  COMMITMENT_PAID: { label: 'Deposit Paid • Sourcing', type: 'info' },
  CONFIRMED: { label: 'Confirmed', type: 'info' },
  PREPARING: { label: 'Harvesting & Packing', type: 'info' },
  READY_FOR_DELIVERY: { label: 'Ready for Dispatch', type: 'info' },
  READY_FOR_PICKUP: { label: 'Ready for Pickup', type: 'success' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', type: 'warning' },
  DELIVERED: { label: 'Delivered • Awaiting Balance', type: 'success' },
  PICKED_UP: { label: 'Picked Up • Awaiting Balance', type: 'success' },
  BALANCE_PAID: { label: 'Balance Paid', type: 'success' },
  COMPLETED: { label: 'Completed', type: 'success' },
  CANCELLED: { label: 'Cancelled', type: 'danger' },
  PAYMENT_FAILED: { label: 'Payment Failed', type: 'danger' },
  REFUNDED: { label: 'Refunded', type: 'neutral' }
};

const Orders = () => {
  const { t, currentLang } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  useEffect(() => {
    let isMounted = true;
    const fetchOrders = async () => {
      try {
        setLoading(true);
        // GET /api/orders -> { success, items: [...], pagination: {...} } (order.controller spreads listCustomerOrders)
        const res = await apiClient.get(`/orders?page=${page}&limit=10&lang=${currentLang || 'en'}`);
        if (isMounted && Array.isArray(res?.items)) {
          setOrders(res.items);
          if (res.pagination) setPagination(res.pagination);
        }
      } catch (err) {
        console.error('Failed to fetch customer orders', err);
        if (isMounted) setError(err.message || 'Could not load your orders');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrders();
    return () => {
      isMounted = false;
    };
  }, [currentLang, page]);

  if (loading) {
    return (
      <div className="card um-subview-card">
        <div className="um-subview-loading">
          <div className="um-spinner" />
          <p>Loading your farm orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card um-subview-card">
        <div className="alert alert-error">
          <span>⚠️ {error}</span>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="card um-subview-card um-empty-orders">
        <span className="um-empty-orders-icon">📦</span>
        <h3>No Orders Yet</h3>
        <p>You haven’t placed any orders yet. Fresh harvests are waiting for you!</p>
        <Link to="/catalog" className="btn btn-primary">
          Explore Food Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="card um-subview-card">
      <div className="um-subview-header">
        <h2>{t('orders')}</h2>
        <span className="um-orders-count-badge">{pagination.total} {pagination.total === 1 ? 'order' : 'orders'}</span>
      </div>

      <div className="um-orders-list">
        {orders.map((order) => {
          const statusInfo = STATUS_BADGES[order.status] || { label: order.status, type: 'neutral' };
          const dateStr = new Date(order.createdAt).toLocaleDateString('en-UG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          return (
            <div key={order.id} className="um-order-card card">
              <div className="um-order-card-header">
                <div>
                  <strong className="um-order-number">{order.orderNumber}</strong>
                  <span className="um-order-date">{dateStr}</span>
                </div>
                <span className={`badge badge-${statusInfo.type}`}>
                  {statusInfo.label}
                </span>
              </div>

              <div className="um-order-card-body">
                <div className="um-order-detail-col">
                  <span className="um-order-col-label">Fulfillment</span>
                  <strong>
                    {order.fulfillment?.method === 'HOME_DELIVERY' ? '🚚 Doorstep Delivery' : '📍 Station Pickup'}
                  </strong>
                </div>

                <div className="um-order-detail-col">
                  <span className="um-order-col-label">{t('commitmentDeposit')}</span>
                  <span className="um-order-deposit-val">
                    {formatUGX(order.pricing?.commitmentUgx || 0)}
                  </span>
                </div>

                <div className="um-order-detail-col">
                  <span className="um-order-col-label">Total Amount</span>
                  <span className="um-order-total-val">
                    {formatUGX(order.pricing?.totalUgx || 0)}
                  </span>
                </div>

                <div className="um-order-action-col">
                  <Link
                    to={`/account/orders/${order.id}`}
                    className="btn btn-secondary btn-sm um-view-order-btn"
                  >
                    View & Track →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="um-pagination" style={{ marginTop: '1.25rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Previous
          </button>
          <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default Orders;
