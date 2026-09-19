import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useCart } from '../../Context/CartContext';
import { useAuth } from '../../Context/AuthContext';
import { useLanguage } from '../../Context/LanguageContext';
import './MobileNav.css';

/**
 * UgaMarket — home to home | Mobile bottom navigation.
 * Thumb-reachable primary destinations on phones; hidden on desktop
 * (display: none below 768px) and on the auth page.
 */
const MobileNav = () => {
  const { itemCount } = useCart();
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  const onOrders = location.pathname.startsWith('/account/orders');

  const navItems = [
    { to: '/', label: t('home'), icon: 'home' },
    { to: '/catalog', label: t('catalog'), icon: 'shop' },
    { to: '/cart', label: t('cart'), icon: 'cart', badge: itemCount > 0 ? itemCount : null },
    isAuthenticated
      ? { to: '/account/orders', label: t('orders'), icon: 'orders' }
      : { to: '/login', label: t('login'), icon: 'account' },
    isAuthenticated
      ? { to: '/account/notifications', label: t('notifications'), icon: 'bell' }
      : { to: '/login?signup=true', label: t('signup'), icon: 'account' }
  ];

  return (
    <nav className="um-mobilenav" aria-label="Primary">
      <div className="um-mobilenav-inner">
        {navItems.map((item) => {
          const isActive =
            item.to === '/'
              ? location.pathname === '/'
              : item.to.startsWith('/account')
                ? onOrders || location.pathname.startsWith(item.to)
                : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to + item.label}
              to={item.to}
              className={`um-mobilenav-item ${isActive ? 'um-mobilenav-item--active' : ''}`}
            >
              <span className="um-mobilenav-icon">
                {item.badge && <span className="um-mobilenav-badge">{item.badge}</span>}
                <BottomNavIcon name={item.icon} />
              </span>
              <span className="um-mobilenav-label">{item.label}</span>
            </NavLink>
        );
        })}
      </div>
    </nav>
  );
};

/* Coherent line-icon set (same stroke style as the header icons) */
const BottomNavIcon = ({ name }) => {
  const common = {
    width: 21,
    height: 21,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case 'shop':
      return (
        <svg {...common}>
          <path d="M4 7l1.5-4h13L20 7" />
          <path d="M4 7h16l-1.2 12a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 7z" />
          <path d="M9 11a3 3 0 0 0 6 0" />
        </svg>
      );
    case 'cart':
      return (
        <svg {...common}>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case 'orders':
      return (
        <svg {...common}>
          <path d="M21 8v13H3V8" />
          <path d="M1 3h22v5H1z" />
          <path d="M10 12h4" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      );
    case 'account':
      return (
        <svg {...common}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    default:
      return null;
  }
};

export default MobileNav;
