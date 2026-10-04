import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, BellRing, CheckCheck, Menu, MessageCircle, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { formatRole, formatRelative } from '../../utils/format';
import { notificationIcon } from '../../utils/notifications';
import './Topbar.css';

/**
 * Application topbar: page title, live status, sound toggle, messages,
 * notification bell (latest alerts, mark read) and the signed-in profile.
 */
export default function Topbar({ title, onMenuClick }) {
  const { admin, role } = useAuth();
  const { connected, unreadNotifications, unreadMessages, recent, soundOn, setSoundOn, desktopPermission, enableDesktop, markRead, markAllRead } = useRealtime();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => wrapRef.current && !wrapRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = (admin?.fullName || 'A')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const openNotification = (n) => {
    if (!n.isRead) markRead([n.id]);
    setOpen(false);
    if (n.linkUrl) navigate(n.linkUrl);
  };

  return (
    <header className="topbar">
      <button type="button" className="topbar__menu" onClick={onMenuClick} aria-label="Open navigation menu">
        <Menu size={19} aria-hidden="true" />
      </button>
      <h2 className="topbar__title">{title}</h2>
      <div className="topbar__spacer" />

      <span className={`topbar__live ${connected ? 'topbar__live--on' : ''}`} title={connected ? 'Live updates connected' : 'Reconnecting to live updates…'}>
        <span aria-hidden="true" />
        {connected ? 'Live' : 'Offline'}
      </span>

      <button
        type="button"
        className="topbar__icon"
        onClick={() => setSoundOn(!soundOn)}
        aria-label={soundOn ? 'Mute alert sound' : 'Turn on alert sound'}
        title={soundOn ? 'Alert sound on' : 'Alert sound off'}
      >
        {soundOn ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
      </button>

      <Link to="/messages" className="topbar__icon" aria-label={`Messages, ${unreadMessages} unread`} title="Customer messages">
        <MessageCircle size={18} aria-hidden="true" />
        {unreadMessages > 0 && <span className="topbar__badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}
      </Link>

      <div className="topbar__bell" ref={wrapRef}>
        <button
          type="button"
          className={`topbar__icon ${unreadNotifications > 0 ? 'topbar__icon--ring' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`Notifications, ${unreadNotifications} unread`}
        >
          {unreadNotifications > 0 ? <BellRing size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
          {unreadNotifications > 0 && <span className="topbar__badge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
        </button>

        {open && (
          <div className="notif-panel" role="menu">
            <div className="notif-panel__head">
              <strong>Notifications</strong>
              {unreadNotifications > 0 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={markAllRead}>
                  <CheckCheck size={14} aria-hidden="true" /> Mark all read
                </button>
              )}
            </div>
            {desktopPermission === 'default' && (
              <button type="button" className="notif-panel__desktop" onClick={enableDesktop}>
                <BellRing size={14} aria-hidden="true" /> Enable desktop alerts for new orders
              </button>
            )}
            {recent.length === 0 ? (
              <p className="notif-panel__empty">No notifications yet.</p>
            ) : (
              <ul className="notif-panel__list">
                {recent.slice(0, 10).map((n) => {
                  const Icon = notificationIcon(n.type);
                  return (
                    <li key={n.id}>
                      <button type="button" role="menuitem" className={`notif-item ${n.isRead ? '' : 'notif-item--unread'}`} onClick={() => openNotification(n)}>
                        <span className={`notif-item__icon notif-item__icon--${n.type}`}>
                          <Icon size={15} aria-hidden="true" />
                        </span>
                        <span className="notif-item__body">
                          <strong>{n.title}</strong>
                          <span>{n.message}</span>
                          <small>{formatRelative(n.createdAt)}</small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link to="/notifications" className="notif-panel__all" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </div>
        )}
      </div>

      <div className="topbar__profile">
        <span className="topbar__avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="topbar__meta">
          <strong>{admin?.fullName || 'Admin'}</strong>
          <small>{formatRole(role)}</small>
        </span>
      </div>
    </header>
  );
}
