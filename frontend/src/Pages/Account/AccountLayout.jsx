import React from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../Context/AuthContext';
import { useLanguage } from '../../Context/LanguageContext';
import { Package, MapPin, Bell, ShoppingCart, LogOut } from 'lucide-react';
import './Account.css';

const AccountLayout = () => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="um-account-page">
      <div className="container">
        <div className="um-account-header">
          <div>
            <h1 className="um-account-title">{t('account')}</h1>
            <p className="um-account-subtitle">
              Welcome back, <strong>{user?.fullName || 'Customer'}</strong> ({user?.phone})
            </p>
          </div>
        </div>

        <div className="um-account-grid">
          {/* Sidebar Nav */}
          <aside className="um-account-sidebar card">
            <div className="um-account-user-card">
              <div className="um-account-avatar">
                {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="um-account-user-meta">
                <strong>{user?.fullName || 'Customer'}</strong>
                <span>{user?.phone}</span>
                {user?.email && <small>{user.email}</small>}
              </div>
            </div>

            <nav className="um-account-nav">
              <NavLink
                to="/account/orders"
                className={({ isActive }) =>
                  `um-account-nav-link ${isActive ? 'um-account-nav-link--active' : ''}`
                }
              >
                <Package size={16} strokeWidth={1.75} /> {t('orders')}
              </NavLink>

              <NavLink
                to="/account/addresses"
                className={({ isActive }) =>
                  `um-account-nav-link ${isActive ? 'um-account-nav-link--active' : ''}`
                }
              >
                <MapPin size={16} strokeWidth={1.75} /> {t('addresses')}
              </NavLink>

              <NavLink
                to="/account/notifications"
                className={({ isActive }) =>
                  `um-account-nav-link ${isActive ? 'um-account-nav-link--active' : ''}`
                }
              >
                <Bell size={16} strokeWidth={1.75} /> {t('notifications')}
              </NavLink>

              <div className="um-account-nav-divider" />

              <Link to="/catalog" className="um-account-nav-link">
                <ShoppingCart size={16} strokeWidth={1.75} /> Food Catalog
              </Link>

              <Link to="/pickup-stations" className="um-account-nav-link">
                <MapPin size={16} strokeWidth={1.75} /> Pickup Stations
              </Link>

              <button
                type="button"
                onClick={logout}
                className="um-account-nav-link um-account-nav-link--danger"
              >
                <LogOut size={16} strokeWidth={1.75} /> {t('logout')}
              </button>
            </nav>
          </aside>

          {/* Main Account View Content */}
          <main className="um-account-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default AccountLayout;
