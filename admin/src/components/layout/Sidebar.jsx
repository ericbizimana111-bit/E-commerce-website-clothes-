import { NavLink, useNavigate } from 'react-router-dom';
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  Package,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth, hasRole, CATALOG_ROLES, OPERATIONS_ROLES } from '../../context/AuthContext';
import { formatRole } from '../../utils/format';
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
    ],
  },
  {
    label: 'Commerce',
    items: [
      { to: '/orders', label: 'Orders', icon: ShoppingBag, roles: OPERATIONS_ROLES },
      { to: '/products', label: 'Products', icon: Package, roles: CATALOG_ROLES },
      { to: '/categories', label: 'Categories', icon: Boxes, roles: CATALOG_ROLES },
      { to: '/inventory', label: 'Inventory', icon: ClipboardList, roles: CATALOG_ROLES },
    ],
  },
  {
    label: 'Fulfillment',
    items: [
      { to: '/deliveries', label: 'Deliveries', icon: Truck, roles: OPERATIONS_ROLES },
    ],
  },
  {
    label: 'Finance',
    items: [{ to: '/payments', label: 'Payments', icon: Wallet, roles: OPERATIONS_ROLES }],
  },
  {
    label: 'Customers',
    items: [{ to: '/customers', label: 'Customers', icon: Users, roles: OPERATIONS_ROLES }],
  },
];

export default function Sidebar({ open, onClose }) {
  const { role, admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
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
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
                    }
                    onClick={onClose}
                  >
                  const { to, label, icon: Icon, end } = item;
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
                      <Icon size={17} aria-hidden="true" />
                      <span>{label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}

          <div className="sidebar__section">
            <div className="sidebar__section-label">Account</div>
            <div className="sidebar__user">
              <span className="sidebar__user-name">{admin?.fullName || 'Admin'}</span>
              <span className="sidebar__user-role">{formatRole(role)}</span>
            </div>
            <button type="button" className="sidebar__link sidebar__logout" onClick={handleLogout}>
              <ShieldCheck size={17} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
}
