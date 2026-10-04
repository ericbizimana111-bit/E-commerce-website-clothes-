import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import StatusBadge from '../../components/ui/StatusBadge';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { useRealtimeEvent } from '../../context/RealtimeContext';
import { BOOKING_STATUSES, formatKm, formatRelative, getBookingStatusMeta } from '../../utils/format';
import './Services.css';

const SLOT_LABELS = { MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening' };

/** Home-service bookings queue: GET /api/admin/services/requests */
export default function ServiceRequestsPage() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState(null);
  const [services, setServices] = useState([]);
  const [status, setStatus] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/admin/services/catalog')
      .then((res) => setServices(res?.data?.services || []))
      .catch(() => setServices([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      if (serviceId) params.set('serviceId', serviceId);
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/admin/services/requests?${params}`);
      setItems(res?.data?.items || []);
      setCounts(res?.data?.statusCounts || {});
      setPagination(res?.data?.pagination || null);
    } catch (err) {
      setError(err.message || 'Unable to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [page, status, serviceId, search]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvent('notification', (n) => {
    if (n.type === 'NEW_SERVICE_REQUEST' || n.type === 'SERVICE_REQUEST_CANCELLED') load();
  });

  const columns = [
    {
      key: 'requestNumber',
      header: 'Booking',
      render: (r) => (
        <Link to={`/service-requests/${r.id}`} className="mono table-link">
          {r.requestNumber}
        </Link>
      ),
    },
    { key: 'service', header: 'Service', render: (r) => r.service?.name || '—' },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <span className="cell-stack">
          <strong>{r.customer?.fullName}</strong>
          <small>{r.contactPhone}</small>
        </span>
      ),
    },
    {
      key: 'area',
      header: 'Location',
      render: (r) => (
        <span className="cell-stack">
          <span>{[r.address?.division, r.address?.district].filter(Boolean).join(', ')}</span>
          <small>{formatKm(r.distanceKm)}</small>
        </span>
      ),
    },
    {
      key: 'when',
      header: 'Preferred',
      render: (r) => (
        <span className="cell-stack">
          <span>{r.preferredDate}</span>
          <small>{SLOT_LABELS[r.preferredSlot] || r.preferredSlot}</small>
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} kind="booking" /> },
    { key: 'provider', header: 'Technician', render: (r) => r.provider?.fullName || <span className="text-muted">Unassigned</span> },
    { key: 'createdAt', header: 'Received', render: (r) => formatRelative(r.createdAt) },
  ];

  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div>
      <PageHeader
        title="Service bookings"
        description="Customers' home-service requests. Confirm, quote, assign a technician and track each job to completion."
        actions={
          <button type="button" className="btn btn--ghost btn--sm" onClick={load}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        }
      />

      <div className="status-tabs" role="tablist" aria-label="Filter by status">
        <button type="button" role="tab" aria-selected={!status} className={!status ? 'status-tab status-tab--on' : 'status-tab'} onClick={() => { setStatus(''); setPage(1); }}>
          All <span>{total}</span>
        </button>
        {BOOKING_STATUSES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={status === s} className={status === s ? 'status-tab status-tab--on' : 'status-tab'} onClick={() => { setStatus(s); setPage(1); }}>
            {getBookingStatusMeta(s).label} <span>{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <SearchInput value={search} onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Search booking #, customer or phone" />
        <select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setPage(1); }} aria-label="Filter by service">
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          isLoading={loading}
          skeleton={<div className="panel panel-pad text-muted">Loading bookings…</div>}
          emptyState={<EmptyState title="No bookings" message="New home-service requests will appear here instantly." />}
        />
      )}
      <Pagination pagination={pagination} onPageChange={setPage} />
    </div>
  );
}
