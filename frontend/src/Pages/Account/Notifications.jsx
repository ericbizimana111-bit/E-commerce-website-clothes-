import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCheck, CreditCard, MessageCircle, Package, Truck, Wrench } from 'lucide-react';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';
import { useRealtime, useRealtimeEvent } from '../../Context/RealtimeContext';
import { friendlyError } from '../../utils/errors';
import './Notifications.css';

const TYPE_ICONS = {
  ORDER_UPDATE: Package,
  DELIVERY_UPDATE: Truck,
  PAYMENT_UPDATE: CreditCard,
  SERVICE_UPDATE: Wrench,
  NEW_MESSAGE: MessageCircle
};

/**
 * Notifications (order, delivery, payment, booking and message updates).
 * New notifications arrive live; each links to the page it is about.
 */
const Notifications = () => {
  const { t, formatDateTime } = useLanguage();
  const { setUnreadNotifications } = useRealtime();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/notifications');
      setNotifications(res?.data?.notifications || []);
      setUnreadNotifications(res?.data?.unread || 0);
    } catch (err) {
      setError(friendlyError(err, t, 'notificationsLoadError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setUnreadNotifications]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvent('notification', (n) => {
    if (n?.id) setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
  });

  const markAsRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadNotifications((c) => Math.max(0, c - 1));
    try {
      await apiClient.patch(`/notifications/${id}/read`);
    } catch {
      load();
    }
  };

  const markAll = async () => {
    try {
      await apiClient.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadNotifications(0);
    } catch (err) {
      setError(friendlyError(err, t, 'errGeneric'));
    }
  };

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="panel account-card">
      <div className="account-card__head">
        <h2>{t('notificationsTitle')}</h2>
        {unread > 0 && (
          <div className="notes__head-actions">
            <span className="badge badge-info">{t('unreadCount', { count: unread })}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={markAll}>
              <CheckCheck size={14} aria-hidden="true" /> {t('markAllRead')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="um-subview-loading" role="status">
          <div className="um-spinner" />
          <p>{t('loading')}</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="state-block">
          <span className="state-block__icon">
            <Bell size={34} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <p>{t('noNotifications')}</p>
        </div>
      ) : (
        <ul className="notes">
          {notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type] || Bell;
            const content = (
              <>
                <strong>{n.title || t('marketplaceUpdate')}</strong>
                <p>{n.message}</p>
                <time dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
              </>
            );
            return (
              <li key={n.id} className={`note ${n.isRead ? '' : 'note--unread'}`}>
                <span className="note__icon" aria-hidden="true">
                  <Icon size={17} />
                </span>
                {n.linkUrl ? (
                  <Link to={n.linkUrl} className="note__body note__body--link" onClick={() => !n.isRead && markAsRead(n.id)}>
                    {content}
                  </Link>
                ) : (
                  <div className="note__body">{content}</div>
                )}
                {!n.isRead && (
                  <button type="button" onClick={() => markAsRead(n.id)} className="btn btn-secondary btn-sm" aria-label={t('markAsRead')}>
                    <CheckCheck size={14} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default Notifications;
