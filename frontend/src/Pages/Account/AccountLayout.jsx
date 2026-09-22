import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, LogOut, MapPin, Package, ShoppingCart } from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import { useLanguage } from '../../Context/LanguageContext';
import ConfirmDialog from '../../Components/ui/ConfirmDialog';
import './Account.css';

const AccountLayout = () => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const links = [
    { to: '/account/orders', label: t('orders'), Icon: Package },
    { to: '/account/addresses', label: t('addresses'), Icon: MapPin },
    { to: '/account/notifications', label: t('notifications'), Icon: Bell }
  ];

  const doLogout = () => {
    setConfirmLogout(false);
    logout();
    navigate('/');
  };

  return (
    <div className="account container">
      <header className="account__head">
        <h1 className="page-title">{t('account')}</h1>
        <p className="section-desc">{t('accountWelcome', { name: user?.fullName || t('customerFallback'), phone: user?.phone || '' })}</p>
      </header>

      <div className="account__grid">
        <aside className="account__side panel">
          <div className="account__user">
            <span className="um-avatar">{user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}</span>
            <div>
              <strong>{user?.fullName || t('customerFallback')}</strong>
              <span>{user?.phone}</span>
              {user?.email && <small>{user.email}</small>}
            </div>
          </div>

          <nav className="account__nav" aria-label={t('account')}>
            {links.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `account__link ${isActive ? 'account__link--active' : ''}`}>
                <Icon size={17} aria-hidden="true" /> {label}
              </NavLink>
            ))}
            <Link to="/catalog" className="account__link account__link--extra">
              <ShoppingCart size={17} aria-hidden="true" /> {t('foodCatalog')}
            </Link>
            <Link to="/pickup-stations" className="account__link account__link--extra">
              <MapPin size={17} aria-hidden="true" /> {t('pickupStations')}
            </Link>
            <button type="button" onClick={() => setConfirmLogout(true)} className="account__link account__link--danger">
              <LogOut size={17} aria-hidden="true" /> {t('logout')}
            </button>
          </nav>
        </aside>

        <main className="account__content">
          <Outlet />
        </main>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title={t('logoutTitle')}
        message={t('logoutMessage')}
        confirmLabel={t('logout')}
        cancelLabel={t('logoutStay')}
        danger
        onConfirm={doLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
};

export default AccountLayout;
