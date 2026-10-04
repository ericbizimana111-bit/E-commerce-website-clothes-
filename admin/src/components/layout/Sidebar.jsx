import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Bell,
  Boxes,
  CalendarCheck,
  ClipboardList,
  HardHat,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Package,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth, hasRole, CATALOG_ROLES, OPERATIONS_ROLES } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { formatRole } from '../../utils/format';
import ConfirmDialog from '../ui/ConfirmDialog';
import './Sidebar.css';

const LOGO_SRC = '/logo.png';

/**
 * Admin navigation. Items render only when the current role may use the
 * underlying backend endpoints (frontend hiding is UX; backend RBAC remains
 * the security boundary). Lucide icons only.
 */

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: OPERATIONS_ROLES },
      { to: '/notifications', label: 'Notifications', icon: Bell, roles: OPERATIONS_ROLES, badge: 'notifications' },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { to: '/orders', label: 'Orders', icon: ShoppingBag, roles: OPERATIONS_ROLES },
      { to: '/deliveries', label: 'Deliveries', icon: Truck, roles: OPERATIONS_ROLES },
      { to: '/products', label: 'Products', icon: Package, roles: CATALOG_ROLES },
      { to: '/categories', label: 'Categories', icon: Boxes, roles: CATALOG_ROLES },
      { to: '/inventory', label: 'Inventory', icon: ClipboardList, roles: CATALOG_ROLES },
    ],
  },
  {
    label: 'Home services',
    items: [
      { to: '/service-requests', label: 'Bookings', icon: CalendarCheck, roles: OPERATIONS_ROLES },
      { to: '/services', label: 'Service catalogue', icon: Wrench, roles: OPERATIONS_ROLES },
      { to: '/technicians', label: 'Technicians', icon: HardHat, roles: OPERATIONS_ROLES },
    ],
  },
  {
    label: 'Customers',
    items: [
      { to: '/messages', label: 'Messages', icon: MessageCircle, roles: OPERATIONS_ROLES, badge: 'messages' },
      { to: '/customers', label: 'Customers', icon: Users, roles: OPERATIONS_ROLES },
    ],
  },
  {
    label: 'Finance & settings',
    items: [
      { to: '/payments', label: 'Payments', icon: Wallet, roles: OPERATIONS_ROLES },
      { to: '/settings', label: 'Store settings', icon: Settings, roles: OPERATIONS_ROLES },
    ],
  },
];

export default function Sidebar({ open, onClose }) {
  const { role, admin, logout } = useAuth();
  const { unreadNotifications, unreadMessages } = useRealtime();
  const badges = { notifications: unreadNotifications, messages: unreadMessages };
  const navigate = useNavigate();

  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const initials = (admin?.fullName || 'A')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleLogout = () => {
    setConfirmingLogout(false);
    onClose();
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-label="Admin navigation">
        <div className="sidebar__brand">
          <img src={LOGO_SRC} alt="UgaMarket — home to home" className="sidebar__logo" />
          <button
            type="button"
            className="sidebar__close"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <nav className="sidebar__nav">
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => hasRole(role, item.roles));
            if (items.length === 0) return null;
            return (
              <div key={section.label} className="sidebar__section">
                <div className="sidebar__section-label">{section.label}</div>
                {items.map((item) => {
                  const { to, label, icon: Icon, end, badge } = item;
                  const count = badge ? badges[badge] : 0;
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
                      }
                      onClick={onClose}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span>{label}</span>
                      {count > 0 && <span className="sidebar__count">{count > 99 ? '99+' : count}</span>}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <span className="sidebar__avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="sidebar__user-text">
              <span className="sidebar__user-name">{admin?.fullName || 'Admin'}</span>
              <span className="sidebar__user-role">{formatRole(role)}</span>
            </span>
          </div>
          <button
            type="button"
            className="sidebar__logout"
            onClick={() => setConfirmingLogout(true)}
          >
            <LogOut size={16} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmingLogout}
        title="Sign out?"
        message="You will be signed out of the Operations Console and will need to sign in again to continue."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        danger
        onConfirm={handleLogout}
        onCancel={() => setConfirmingLogout(false)}
      />
    </>
  );
}
