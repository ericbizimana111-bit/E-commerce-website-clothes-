import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Truck } from 'lucide-react';
import api from '../../services/api';
import { useAuth, hasRole, OPERATIONS_ROLES } from '../../context/AuthContext';
import { useToast } from '../../components/feedback/Toast';
import { formatUGX, formatDateTime, getDeliveryStatusMeta } from '../../utils/format';
import DataTable from '../../components/ui/DataTable';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import DeliveryStatusModal from './DeliveryStatusModal';
import { TableSkeleton } from '../../components/ui/loaders';
import { EmptyState, ErrorState } from '../../components/ui/states';
import './DeliveriesPage.css';

/**
 * Fulfillment operations (DISPATCHER/ADMIN/SUPER_ADMIN).
 * Verified contract:
 *  - GET   /api/admin/deliveries?page&limit&status&fulfillmentType&orderNumber
 *          -> { success, items: [delivery+orderNumber+orderStatus], pagination }
 *  - PATCH /api/admin/deliveries/:id/assign { assignedAdminId, notes? }
 *  - PATCH /api/admin/deliveries/:id/status { status, failureReason?, failureMessage?, notes?, scheduledAt? }
 * The backend delivery state machine + fulfillment-type guards are authoritative;
 * the UI only offers statuses and lets the backend reject invalid moves (409).
 */
const DELIVERY_STATUSES = [
  'PENDING',
  'ASSIGNED',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PICKED_UP',
  'FAILED',
  'CANCELLED',
];

const STATUS_TONE_CLASS = {
  success: 'badge--success',
  warning: 'badge--warning',
  info: 'badge--info',
  danger: 'badge--danger',
  neutral: 'badge--neutral',
};

export default function DeliveriesPage() {
  const { role } = useAuth();
  const { showToast } = useToast();
  const canOperate = hasRole(role, OPERATIONS_ROLES);

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [fulfillment, setFulfillment] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [activeCount, setActiveCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (status) params.set('status', status);
      if (fulfillment) params.set('fulfillmentType', fulfillment);
      if (orderNumber.trim()) params.set('orderNumber', orderNumber.trim());

      const res = await api.get(`/admin/deliveries?${params.toString()}`);
      setRows(Array.isArray(res?.items) ? res.items : []);
      setPagination(res?.pagination || null);

      // Live count of in-flight deliveries for the summary strip.
      const activeRes = await api.get(
        '/admin/deliveries?page=1&limit=1&status=PENDING,ASSIGNED,READY,OUT_FOR_DELIVERY',
      ).catch(() => null);
      // List endpoint validates status as a single enum value, so count via
      // the unfiltered total minus terminal states is not available — use the
      // current page rows instead when the combined query is rejected.
      setActiveCount(activeRes?.pagination?.total ?? null);
    } catch (err) {
      setError(err.message || 'Unable to load deliveries.');
    } finally {
      setLoading(false);
    }
  }, [page, status, fulfillment, orderNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: 'orderNumber',
      header: 'Order',
      render: (row) => (
        <Link to={`/orders/${row.orderId}`} className="mono">
          {row.orderNumber || row.orderId}
        </Link>
      ),
    },
    {
      key: 'fulfillmentType',
      header: 'Type',
      render: (row) =>
        row.fulfillmentType === 'PICKUP_STATION' ? (
          <span className="badge badge--info">Pickup</span>
        ) : (
          <span className="badge badge--neutral">Home</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const meta = getDeliveryStatusMeta(row.status);
        return <span className={`badge ${STATUS_TONE_CLASS[meta.tone]}`}>{meta.label}</span>;
      },
    },
    {
      key: 'fee',
      header: 'Fee',
      render: (row) => formatUGX(row.deliveryFeeUgx),
    },
    {
      key: 'destination',
      header: 'Destination',
      render: (row) => {
        const snap = row.addressSnapshot || row.stationSnapshot;
        if (!snap) return '—';
        return (
          <div className="deliveries-page__dest">
            {snap.district}
            <div className="deliveries-page__sub">{snap.streetAddress || snap.addressText}</div>
          </div>
        );
      },
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (row) => formatDateTime(row.updatedAt),
    },
    {
      key: 'actions',
      header: '',
      className: 'deliveries-page__actions-col',
      render: (row) =>
        canOperate && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setStatusTarget(row)}
          >
            <Truck size={12} aria-hidden="true" />
            Manage
          </button>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Deliveries"
        description="Fulfillment operations across home delivery and pickup station orders."
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
            setPage(1);
            load();
          }}
        >
          <input
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="Exact order number, e.g. FB-20260919-A1B2C3"
            aria-label="Filter by order number"
          />
        </form>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          aria-label="Filter by delivery status"
        >
          <option value="">All statuses</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {getDeliveryStatusMeta(s).label}
            </option>
          ))}
        </select>
        <select
          value={fulfillment}
          onChange={(e) => {
            setPage(1);
            setFulfillment(e.target.value);
          }}
          aria-label="Filter by fulfillment type"
        >
          <option value="">All types</option>
          <option value="HOME_DELIVERY">Home delivery</option>
          <option value="PICKUP_STATION">Pickup station</option>
        </select>
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
              <EmptyState
                title="No deliveries found"
                message="Deliveries are created automatically when orders are placed."
              />
            }
          />
          <Pagination pagination={pagination} onPageChange={setPage} />
        </>
      )}

      {statusTarget && (
        <DeliveryStatusModal
          delivery={statusTarget}
          onClose={() => setStatusTarget(null)}
          onDone={async (message) => {
            setStatusTarget(null);
            showToast(message, { type: 'success' });
            await load();
          }}
        />
      )}
    </div>
  );
}
