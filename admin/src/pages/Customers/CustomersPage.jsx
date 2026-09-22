import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, Users } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import { formatDateTime } from '../../utils/format';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import { TableSkeleton } from '../../components/ui/loaders';
import { EmptyState, ErrorState } from '../../components/ui/states';
import './CustomersPage.css';

export default function CustomersPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parseInt(searchParams.get('page') || '1', 10);
  const search = searchParams.get('search') || '';

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected customer detail state
  const [selected, setSelected] = useState(null); // { customer, orders, pagination }
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search.trim()) params.set('search', search.trim());

      // GET /api/admin/customers -> { success, items, pagination }
      const res = await api.get(`/admin/customers?${params.toString()}`);
      setRows(Array.isArray(res?.items) ? res.items : []);
      setPagination(res?.pagination || null);
    } catch (err) {
      setError(err.message || 'Unable to load customers.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

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

  const openDetail = async (customer) => {
    setSelected(null);
    setDetailLoading(true);
    try {
      // GET /api/admin/customers/:id -> { success, data: { customer, orders, pagination } }
      const res = await api.get(`/admin/customers/${customer.id}`);
      setSelected(res?.data || null);
    } catch (err) {
      showToast(err.message || 'Unable to load customer detail.', { type: 'error' });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Registered UgaMarket customers. Search by name, phone, or email."
      />

      <div className="toolbar">
        <SearchInput
          value={search}
          onSearch={(term) => updateParams({ search: term })}
          placeholder="Search by name, phone, or email"
          label="Search customers"
        />
        {search && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setSearchParams({})}
          >
            Clear search
          </button>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          {loading ? (
            <TableSkeleton rows={8} columns={4} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={search ? 'No customers found' : 'No customers yet'}
              message={
                search
                  ? 'No customers match that search.'
                  : 'Customers will appear here once they register.'
              }
              action={
                search ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setSearchParams({})}
                  >
                    Clear search
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="panel">
              <table className="customers-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Email</th>
                    <th scope="col">Orders</th>
                    <th scope="col">Joined</th>
                    <th scope="col" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Name">{c.fullName}</td>
                      <td data-label="Phone" className="mono">{c.phone}</td>
                      <td data-label="Email">{c.email || <span className="text-muted">—</span>}</td>
                      <td data-label="Orders">{c.orderCount ?? 0}</td>
                      <td data-label="Joined">{formatDateTime(c.createdAt)}</td>
                      <td data-label="">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => openDetail(c)}
                          aria-label={`View ${c.fullName}`}
                        >
                          <Eye size={13} aria-hidden="true" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination pagination={pagination} onPageChange={(p) => updateParams({ page: String(p) })} />
        </>
      )}

      {/* Customer detail panel */}
      {(detailLoading || selected) && (
        <div className="panel panel-pad customers-detail" style={{ marginTop: 16 }}>
          {detailLoading ? (
            <p className="text-muted">Loading customer detail…</p>
          ) : selected ? (
            <>
              <div className="customers-detail__head">
                <div>
                  <h3>{selected.customer.fullName}</h3>
                  <p className="text-muted">
                    {selected.customer.phone}
                    {selected.customer.email ? ` · ${selected.customer.email}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className="badge badge--info">
                    {selected.pagination?.total ?? 0} order
                    {(selected.pagination?.total ?? 0) !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                </div>
              </div>

              {selected.orders.length === 0 ? (
                <EmptyState title="No orders" message="This customer has not placed any orders yet." />
              ) : (
                <table className="customers-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th scope="col">Order</th>
                      <th scope="col">Status</th>
                      <th scope="col">Placed</th>
                      <th scope="col" aria-label="Open" />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.orders.map((o) => (
                      <tr key={o.id}>
                        <td data-label="Order" className="mono">{o.orderNumber}</td>
                        <td data-label="Status">
                          <StatusBadge status={o.status} />
                        </td>
                        <td data-label="Placed">{formatDateTime(o.createdAt)}</td>
                        <td data-label="">
                          <Link
                            to={`/orders/${o.id}`}
                            className="btn btn--secondary btn--sm"
                            aria-label={`Open order ${o.orderNumber}`}
                          >
                            Open order
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
