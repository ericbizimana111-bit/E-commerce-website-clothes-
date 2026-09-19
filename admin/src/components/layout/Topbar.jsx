import { Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatRole } from '../../utils/format';
import './Topbar.css';

/**
 * Application topbar. Mobile: menu toggle. Desktop: current context + profile.
 */
export default function Topbar({ title, onMenuClick }) {
  const { admin, role } = useAuth();
  const initials = (admin?.fullName || 'A')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__menu"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu size={19} aria-hidden="true" />
      </button>
      <h2 className="topbar__title">{title}</h2>
      <div className="topbar__spacer" />
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
