import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bell, Check } from 'lucide-react';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';
import { friendlyError } from '../../utils/errors';
import './Notifications.css';

const Notifications = () => {
  const { t, formatDateTime } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    apiClient
      .get('/notifications')
      .then((res) => {
        if (mounted && Array.isArray(res?.data?.notifications)) setNotifications(res.data.notifications);
      })
      .catch((err) => mounted && setError(friendlyError(err, t, 'notificationsLoadError')))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAsRead = async (id) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {
      /* the button stays available so the customer can retry */
    }
  };

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="panel account-card">
      <div className="account-card__head">
        <h2>{t('notificationsTitle')}</h2>
        {unread > 0 && <span className="badge badge-info">{t('unreadCount', { count: unread })}</span>}
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
          {notifications.map((n) => (
            <li key={n.id} className={`note ${n.isRead ? '' : 'note--unread'}`}>
              <span className="note__dot" aria-hidden="true" />
              <div className="note__body">
                <strong>{n.title || t('marketplaceUpdate')}</strong>
                <p>{n.message}</p>
                <time dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
              </div>
              {!n.isRead && (
                <button type="button" onClick={() => markAsRead(n.id)} className="btn btn-secondary btn-sm">
                  <Check size={14} aria-hidden="true" /> {t('markAsRead')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Notifications;
