import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';

const Notifications = () => {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      // GET /api/notifications -> { data: { notifications: [...] } }
      const res = await apiClient.get('/notifications');
      if (Array.isArray(res?.data?.notifications)) {
        setNotifications(res.data.notifications);
      }
    } catch (err) {
      console.error('Failed to load notifications', err);
      setError(err.message || 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAsRead = async (id) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    }
  };

  return (
    <div className="card um-subview-card">
      <div className="um-subview-header">
        <h2>{t('notifications')}</h2>
        <span className="badge badge-info">{notifications.filter((n) => !n.isRead).length} Unread</span>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>⚠️ {error}</span>
        </div>
      )}

      {loading ? (
        <div className="um-subview-loading">
          <div className="um-spinner" />
          <p>Loading notifications...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)' }}>
          <p>You have no notifications at this time.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className="card"
              style={{
                padding: '1rem',
                backgroundColor: notif.isRead ? 'var(--surface)' : '#F0FDF4',
                borderColor: notif.isRead ? 'var(--border)' : '#BBF7D0',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '1rem'
              }}
            >
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--dark)' }}>
                  {notif.title || 'Marketplace Update'}
                </strong>
                <p style={{ fontSize: '0.85rem', color: 'var(--slate)', margin: '0.25rem 0' }}>
                  {notif.message}
                </p>
                <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                  {new Date(notif.createdAt).toLocaleString()}
                </small>
              </div>

              {!notif.isRead && (
                <button
                  type="button"
                  onClick={() => markAsRead(notif.id)}
                  className="btn btn-sm btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '3px 8px', whiteSpace: 'nowrap' }}
                >
                  Mark as Read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notifications;
