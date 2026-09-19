import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import { formatUGX, formatDateTime } from '../../utils/format';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/states';
import './CustomersPage.css';

/**
 * Customer visibility.
 * Backend gap (verified): there is no admin customers endpoint
 * (no GET /api/admin/customers). Customer data appears only as `customer`
 * on admin orders (list search matches phone/email; detail includes user).
 * This page therefore provides honest lookup-by-search through the orders
 * endpoint and renders customer profiles derived from real order data.
 * Nothing is fabricated; the gap is reported in the Phase 10 notes.
 */
export default function CustomersPage() {
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const search = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await api.get(`/admin/orders?page=1&limit=50&search=${encodeURIComponent(q)}`);
      setOrders(Array.isArray(res?.items) ? res.items : []);
      setSearched(true);
      if (!res?.items?.length) {
        showToast('No orders matched — customer profiles come from order records.', { type: 'info' });
      }
    } catch (err) {
      showToast(err.message || 'Search failed.', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Group orders by customer identity (phone is the backend identity key).
  const byCustomer = new Map();
  orders.forEach((o) => {
    if (!o.customer) return;
    const key = o.customer.phone || o.customer.email || o.customer.id;
    if (!byCustomer.has(key)) {
      byCustomer.set(key, { customer: o.customer, orders: [] });
    }
    byCustomer.get(key).orders.push(o);
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Customer profiles derived from order records. The backend does not yet expose a dedicated customers endpoint."
      />

      <div className="panel panel-pad">
        <form className="customers-search" onSubmit={search}>
          <div className="toolbar__search" style={{ maxWidth: 420 }}>
            <Search size={15} aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Customer phone or email"
              aria-label="Search customers by phone or email"
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={loading}>
            <Users size={14} aria-hidden="true" />
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>
      </div>

      {searched && byCustomer.size === 0 && (
        <EmptyState
          title="No customers found"
          message="No order records match that phone or email."
        />
      )}

      {[...byCustomer.entries()].map(([key, { customer, orders: custOrders }]) => (
        <div key={key} className="panel panel-pad customers-card">
          <div className="customers-card__head">
            <div>
              <h3>{customer.fullName || 'Unknown customer'}</h3>
              <p className="text-muted">
                {customer.phone}
                {customer.email ? ` · ${customer.email}` : ''}
              </p>
            </div>
            <span className="badge badge--info">
              {custOrders.length} order{custOrders.length === 1 ? '' : 's'}
            </span>
          </div>
          <table className="customers-card__table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Placed</th>
                <th scope="col">Total</th>
                <th scope="col">Status</th>
                <th scope="col" aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {custOrders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.orderNumber}</td>
                  <td>{formatDateTime(o.createdAt)}</td>
                  <td>{formatUGX(o.pricing?.totalUgx)}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td>
                    <Link to={`/orders/${o.id}`} className="btn btn--secondary btn--sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
