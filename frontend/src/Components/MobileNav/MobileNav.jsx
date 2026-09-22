import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, MapPin, ShoppingCart, User } from 'lucide-react';
import { useCart } from '../../Context/CartContext';
import { useAuth } from '../../Context/AuthContext';
import { useLanguage } from '../../Context/LanguageContext';
import './MobileNav.css';

/**
 * Phone bottom navigation: the five destinations customers use most,
 * within thumb reach. Hidden on tablets/desktops and on the sign-in page.
 */
const MobileNav = () => {
  const { itemCount } = useCart();
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const { pathname } = useLocation();

  const items = [
    { to: '/', label: t('home'), Icon: Home, match: (p) => p === '/' },
    { to: '/catalog', label: t('categories'), Icon: LayoutGrid, match: (p) => p.startsWith('/catalog') || p.startsWith('/product') },
    { to: '/pickup-stations', label: t('pickupStations'), Icon: MapPin, match: (p) => p.startsWith('/pickup') },
    { to: '/cart', label: t('cart'), Icon: ShoppingCart, badge: itemCount, match: (p) => p.startsWith('/cart') || p.startsWith('/checkout') },
    {
      to: isAuthenticated ? '/account/orders' : '/login',
      label: isAuthenticated ? t('account') : t('signIn'),
      Icon: User,
      match: (p) => p.startsWith('/account') || p.startsWith('/login')
    }
  ];

  return (
    <nav className="um-mobilenav" aria-label={t('mobileNavLabel')}>
      {items.map(({ to, label, Icon, badge, match }) => {
        const active = match(pathname);
        return (
          <NavLink key={to} to={to} className={`um-mobilenav__item ${active ? 'um-mobilenav__item--active' : ''}`} aria-current={active ? 'page' : undefined}>
            <span className="um-mobilenav__icon">
              <Icon size={22} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
              {badge > 0 && (
                <span key={badge} className="um-mobilenav__badge">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            <span className="um-mobilenav__label">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};

export default MobileNav;
