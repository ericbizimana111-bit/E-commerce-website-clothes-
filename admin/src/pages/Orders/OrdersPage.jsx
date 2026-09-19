import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, RefreshCw, Search } from 'lucide-react';
import api from '../../services/api';
import { formatUGX, formatDateTime, getOrderStatusMeta } from '../../utils/format';
import DataTable from '../../components/ui/DataTable';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import StatusBadge from '../../components/ui/StatusBadge';
import { TableSkeleton } from '../../components/ui/loaders';
import { EmptyState, ErrorState } from '../../components/ui/states';
import './OrdersPage.css';

/** Order statuses available as a filter — mirrors the backend lifecycle. */
const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING_PAYMENT', label: 'Pending Payment' },
  { value: 'COMMITMENT_PAID', label: 'Commitment Paid' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PREPARING', label: 'Preparing' },
  { value: 'READY_FOR_DELIVERY', label: 'Ready for Delivery' },
  { value: 'READY_FOR_PICKUP', label: 'Ready for Pickup' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'PICKED_UP', label: 'Picked Up' },
  { value: 'BALANCE_PAID', label: 'Balance Paid' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'PAYMENT_FAILED', label: 'Payment Failed' },
  { value: 'DELIVERY_FAILED', label: 'Delivery Failed' },
];

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const page = parseInt(searchParams.get('page') || '1', 10);
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';
  const fulfillment = searchParams.get('fulfillment') || '';

  const [searchInput, setSearchInput] = useState(search);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      if (fulfillment) params.set('fulfillmentMethod', fulfillment);

      // GET /api/admin/orders -> { success, items: [order+customer], pagination }
      const res = await api.get(`/admin/orders?${params.toString()}`);
      setRows(Array.isArray(res?.items) ? res.items : []);
      setPagination(res?.pagination || null);
    } catch (err) {
      setError(err.message || 'Unable to load orders.');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, fulfillment]);

  useEffect(() => {
    load();
  }, [load]);

  const updateParams = (updates) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, val]) => {
      if (val) next.set(key, val);
      else next.delete(key);
    });
    if (!('page' in updates)) next.delete('page');
    setSearchParams(next);
  };

  const columns = [
    {
      key: 'orderNumber',
      header: 'Order',
      render: (row) => (
        <Link to={`/orders/${row.id}`} className="mono">
          {row.orderNumber}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <div>
          {row.customer?.fullName || '—'}
          <div className="orders-page__sub">{row.customer?.phone}</div>
        </div>
      ),
    },
    {
      key: 'fulfillment',
      header: 'Fulfillment',
      render: (row) =>
        row.fulfillment?.method === 'PICKUP_STATION' ? 'Pickup Station' : 'Home Delivery',
    },
    { key: 'createdAt', header: 'Placed', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'totalUgx',
      header: 'Total',
      render: (row) => formatUGX(row.pricing?.totalUgx),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'orders-page__actions-col',
      render: (row) => (
        <Link
          to={`/orders/${row.id}`}
          className="btn btn--secondary btn--sm"
          aria-label={`View order ${row.orderNumber}`}
        >
          <Eye size={13} aria-hidden="true" />
          View
        </Link>
      ),
    },
  ];

  const activeFilterCount = [search, status, fulfillment].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Customer orders across the full UgaMarket lifecycle."
        actions={
          <button type="button" className="btn btn--secondary btn--sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      <div className="toolbar">
        <form
          className="toolbar__search"
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ search: searchInput.trim() });
          }}
        >
          <Search size={15} aria-hidden="true" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search order number, phone, or email"
            aria-label="Search orders"
          />
        </form>

        <select
          value={status}
          onChange={(e) => updateParams({ status: e.target.value })}
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={fulfillment}
          onChange={(e) => updateParams({ fulfillment: e.target.value })}
          aria-label="Filter by fulfillment method"
        >
          <option value="">All fulfillment</option>
          <option value="HOME_DELIVERY">Home Delivery</option>
          <option value="PICKUP_STATION">Pickup Station</option>
        </select>

        {activeFilterCount > 0 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setSearchParams({})}
          >
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            isLoading={loading}
            skeleton={<TableSkeleton rows={8} columns={6} />}
            emptyState={
              activeFilterCount > 0 ? (
                <EmptyState
                  title="No matching orders"
                  message="No orders match the current search or filters."
                  action={
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => setSearchParams({})}>
                      Clear filters
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  title="No orders yet"
                  message="Orders will appear here as customers check out."
                />
              )
            }
          />
          <Pagination pagination={pagination} onPageChange={(p) => updateParams({ page: String(p) })} />
        </>
      )}
    </div>
  );
}
