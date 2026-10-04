import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, CheckCheck, MapPin, Phone, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { useRealtime, useRealtimeEvent } from '../../context/RealtimeContext';
import { formatDateTime, formatRelative, formatUGX } from '../../utils/format';
import { NOTIFICATION_TYPES, notificationIcon, notificationLabel } from '../../utils/notifications';
import './NotificationsPage.css';

/**
 * Staff notification feed: every new order, payment, cancellation, booking
 * and customer message, newest first. Read state is per staff member.
 */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const { markRead, markAllRead, desktopPermission, enableDesktop } = useRealtime();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [type, setType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (type) params.set('type', type);
      if (unreadOnly) params.set('unread', 'true');
      const res = await api.get(`/admin/notifications?${params}`);
      setItems(res?.data?.items || []);
      setPagination(res?.data?.pagination || null);
    } catch (err) {
      setError(err.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [page, type, unreadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvent('notification', (n) => {
    if (page === 1 && (!type || type === n.type)) setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 20));
  });

  const open = (n) => {
    if (!n.isRead) {
      markRead([n.id]);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    }
    if (n.linkUrl) navigate(n.linkUrl);
  };

  const readAll = async () => {
    await markAllRead();
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Everything that needs attention: new orders, payments, cancellations, service bookings and customer messages — delivered live."
        actions={
          <>
            {desktopPermission === 'default' && (
              <button type="button" className="btn btn--secondary btn--sm" onClick={enableDesktop}>
                <BellRing size={14} aria-hidden="true" /> Enable desktop alerts
              </button>
            )}
            <button type="button" className="btn btn--secondary btn--sm" onClick={readAll}>
              <CheckCheck size={14} aria-hidden="true" /> Mark all read
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={load}>
              <RefreshCw size={14} aria-hidden="true" /> Refresh
            </button>
          </>
        }
      />

      <div className="toolbar">
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter by type">
          <option value="">All types</option>
          {NOTIFICATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {notificationLabel(t)}
            </option>
          ))}
        </select>
        <label className="toolbar__check">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} /> Unread only
        </label>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading && items.length === 0 ? (
        <div className="panel panel-pad text-muted">Loading notifications…</div>
      ) : items.length === 0 ? (
        <EmptyState title="All caught up" message="New orders, payments and messages will appear here instantly." />
      ) : (
        <ul className="notif-feed">
          {items.map((n) => {
            const Icon = notificationIcon(n.type);
            const m = n.metadata || {};
            return (
              <li key={n.id}>
                <button type="button" className={`notif-card ${n.isRead ? '' : 'notif-card--unread'}`} onClick={() => open(n)}>
                  <span className={`notif-item__icon notif-item__icon--${n.type}`}>
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span className="notif-card__body">
                    <span className="notif-card__top">
                      <strong>{n.title}</strong>
                      <span className="badge badge--neutral">{notificationLabel(n.type)}</span>
                    </span>
                    <span className="notif-card__msg">{n.message}</span>
                    {n.type === 'NEW_ORDER' && (m.district || m.customerPhone) && (
                      <span className="notif-card__facts">
                        {m.district && (
                          <span>
                            <MapPin size={12} aria-hidden="true" /> {[m.area, m.district].filter(Boolean).join(', ')}
                            {m.distanceKm != null ? ` · ${Number(m.distanceKm).toFixed(1)} km` : ''}
                          </span>
                        )}
                        {m.customerPhone && (
                          <span>
                            <Phone size={12} aria-hidden="true" /> {m.customerPhone}
                          </span>
                        )}
                        {m.totalUgx != null && <span>{formatUGX(m.totalUgx)}</span>}
                      </span>
                    )}
                    <small title={formatDateTime(n.createdAt)}>{formatRelative(n.createdAt)}</small>
                  </span>
                  {!n.isRead && <span className="notif-card__dot" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination pagination={pagination} onPageChange={setPage} />
    </div>
  );
}
