import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  HelpCircle,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  Package,
  ShoppingCart,
  Store,
  User,
  X
} from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import { useCart } from '../../Context/CartContext';
import { useLanguage } from '../../Context/LanguageContext';
import useCategories from '../../utils/useCategories';
import SearchBox from '../SearchBox/SearchBox';
import LanguageSwitcher from '../LanguageSwitcher/LanguageSwitcher';
import ConfirmDialog from '../ui/ConfirmDialog';
import './Navbar.css';

const LOGO_SRC = `${process.env.PUBLIC_URL}/logo.png`;

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { itemCount } = useCart();
  const { t, getLocalizedField } = useLanguage();
  const { categories } = useCategories();
  const location = useLocation();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const userMenuRef = useRef(null);
  const catMenuRef = useRef(null);

  // Close menus whenever the route changes.
  const routeKey = `${location.pathname}${location.search}`;
  const [seenRoute, setSeenRoute] = useState(routeKey);
  if (seenRoute !== routeKey) {
    setSeenRoute(routeKey);
    setDrawerOpen(false);
    setUserMenuOpen(false);
    setCatMenuOpen(false);
  }

  useEffect(() => {
    const onPointer = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
      if (catMenuRef.current && !catMenuRef.current.contains(e.target)) setCatMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setUserMenuOpen(false);
        setCatMenuOpen(false);
        setDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock page scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const firstName = user?.fullName?.split(' ')[0] || t('customerFallback');
  const initial = user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'U';

  const handleLogout = () => {
    setConfirmLogout(false);
    setUserMenuOpen(false);
    setDrawerOpen(false);
    logout();
    navigate('/');
  };

  const navLinks = [
    { to: '/', label: t('home'), end: true },
    { to: '/catalog', label: t('catalog') },
    { to: '/pickup-stations', label: t('pickupStations') },
    { to: '/how-it-works', label: t('howItWorksShort') }
  ];

  return (
    <>
      <a href="#main" className="skip-link">
        {t('skipToContent')}
      </a>

      {/* Utility bar (desktop) */}
      <div className="um-topbar">
        <div className="container um-topbar__inner">
          <p className="um-topbar__msg">{t('topbarMessage')}</p>
          <div className="um-topbar__right">
            <Link to="/how-it-works" className="um-topbar__link">
              <HelpCircle size={14} aria-hidden="true" /> {t('howItWorksShort')}
            </Link>
            <Link to="/pickup-stations" className="um-topbar__link">
              <MapPin size={14} aria-hidden="true" /> {t('pickupStations')}
            </Link>
            <LanguageSwitcher tone="light" />
          </div>
        </div>
      </div>

      <header className={`um-header ${scrolled ? 'um-header--scrolled' : ''}`}>
        <div className="container um-header__main">
          <button
            type="button"
            className="um-icon-btn um-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('openMenu')}
            aria-expanded={drawerOpen}
          >
            <Menu size={22} aria-hidden="true" />
          </button>

          <Link to="/" className="um-logo" aria-label={`${t('brandName')} — ${t('brandTagline')}`}>
            <img src={LOGO_SRC} alt="" className="um-logo__img" width="150" height="44" />
          </Link>

          <div className="um-header__search">
            <SearchBox variant="header" />
          </div>

          <div className="um-header__actions">
            {isAuthenticated ? (
              <div className="um-menu-wrap um-account-desktop" ref={userMenuRef}>
                <button
                  type="button"
                  className="um-account-btn"
                  onClick={() => setUserMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-label={t('userMenu')}
                >
                  <span className="um-avatar">{initial}</span>
                  <span className="um-account-btn__text">
                    <small>{t('hello', { name: firstName })}</small>
                    <strong>{t('account')}</strong>
                  </span>
                  <ChevronDown size={14} aria-hidden="true" className={`um-chev ${userMenuOpen ? 'um-chev--open' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div className="um-dropdown" role="menu">
                    <div className="um-dropdown__profile">
                      <strong>{user?.fullName}</strong>
                      <span>{user?.phone}</span>
                    </div>
                    <Link to="/account/orders" role="menuitem" className="um-dropdown__item">
                      <Package size={16} aria-hidden="true" /> {t('orders')}
                    </Link>
                    <Link to="/account/addresses" role="menuitem" className="um-dropdown__item">
                      <MapPin size={16} aria-hidden="true" /> {t('addresses')}
                    </Link>
                    <Link to="/account/notifications" role="menuitem" className="um-dropdown__item">
                      <Bell size={16} aria-hidden="true" /> {t('notifications')}
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      className="um-dropdown__item um-dropdown__item--danger"
                      onClick={() => setConfirmLogout(true)}
                    >
                      <LogOut size={16} aria-hidden="true" /> {t('logout')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login" className="um-account-btn um-account-desktop">
                <span className="um-avatar um-avatar--ghost">
                  <User size={18} aria-hidden="true" />
                </span>
                <span className="um-account-btn__text">
                  <small>{t('helloGuest')}</small>
                  <strong>{t('signInOrRegister')}</strong>
                </span>
              </Link>
            )}

            <Link
              to="/cart"
              className="um-cart-btn"
              aria-label={t('cartWithCount', { count: itemCount })}
            >
              <ShoppingCart size={22} aria-hidden="true" />
              {itemCount > 0 && (
                <span key={itemCount} className="um-cart-badge">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
              <span className="um-cart-btn__label">{t('cart')}</span>
            </Link>
          </div>
        </div>

        {/* Phone: search always visible under the logo row */}
        <div className="container um-header__search-mobile">
          <SearchBox variant="mobile" />
        </div>

        {/* Category / section navigation (desktop) */}
        <div className="um-subnav">
          <div className="container um-subnav__inner">
            <div className="um-menu-wrap" ref={catMenuRef}>
              <button
                type="button"
                className="um-allcats-btn"
                onClick={() => setCatMenuOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={catMenuOpen}
              >
                <LayoutGrid size={17} aria-hidden="true" />
                {t('allCategories')}
                <ChevronDown size={14} aria-hidden="true" className={`um-chev ${catMenuOpen ? 'um-chev--open' : ''}`} />
              </button>

              {catMenuOpen && (
                <div className="um-mega">
                  {categories.length === 0 ? (
                    <p className="um-mega__empty">{t('catsEmpty')}</p>
                  ) : (
                    <ul className="um-mega__grid">
                      {categories.map((cat) => (
                        <li key={cat.id}>
                          <Link to={`/catalog?category=${encodeURIComponent(cat.slug)}`} className="um-mega__item">
                            <span>{getLocalizedField(cat, 'name') || cat.name}</span>
                            <small>{t('productsCount', { count: cat.productCount ?? 0 })}</small>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link to="/catalog" className="um-mega__all">
                    {t('viewAllProducts')} →
                  </Link>
                </div>
              )}
            </div>

            <nav className="um-subnav__links" aria-label={t('browse')}>
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => `um-subnav__link ${isActive ? 'um-subnav__link--active' : ''}`}
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="um-subnav__cats" aria-label={t('categories')}>
              {categories.slice(0, 4).map((cat) => (
                <Link key={cat.id} to={`/catalog?category=${encodeURIComponent(cat.slug)}`} className="um-subnav__cat">
                  {getLocalizedField(cat, 'name') || cat.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        className={`um-backdrop ${drawerOpen ? 'um-backdrop--open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`um-drawer ${drawerOpen ? 'um-drawer--open' : ''}`}
        aria-label={t('menu')}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div className="um-drawer__head">
          <Link to="/" className="um-logo">
            <img src={LOGO_SRC} alt={t('brandName')} className="um-logo__img" width="130" height="38" />
          </Link>
          <button type="button" className="um-icon-btn" onClick={() => setDrawerOpen(false)} aria-label={t('closeMenu')}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="um-drawer__body">
          {isAuthenticated ? (
            <div className="um-drawer__user">
              <span className="um-avatar">{initial}</span>
              <span>
                <strong>{user?.fullName}</strong>
                <small>{user?.phone}</small>
              </span>
            </div>
          ) : (
            <div className="um-drawer__auth">
              <Link to="/login" className="btn btn-secondary btn-block">
                {t('signIn')}
              </Link>
              <Link to="/login?signup=true" className="btn btn-primary btn-block">
                {t('signup')}
              </Link>
            </div>
          )}

          <div className="um-drawer__section">
            <span className="um-drawer__label">{t('browse')}</span>
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `um-drawer__link ${isActive ? 'um-drawer__link--active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          {categories.length > 0 && (
            <div className="um-drawer__section">
              <span className="um-drawer__label">{t('categories')}</span>
              {categories.map((cat) => (
                <Link key={cat.id} to={`/catalog?category=${encodeURIComponent(cat.slug)}`} className="um-drawer__link">
                  <Store size={16} aria-hidden="true" /> {getLocalizedField(cat, 'name') || cat.name}
                </Link>
              ))}
            </div>
          )}

          {isAuthenticated && (
            <div className="um-drawer__section">
              <span className="um-drawer__label">{t('account')}</span>
              <Link to="/account/orders" className="um-drawer__link">
                <Package size={16} aria-hidden="true" /> {t('orders')}
              </Link>
              <Link to="/account/addresses" className="um-drawer__link">
                <MapPin size={16} aria-hidden="true" /> {t('addresses')}
              </Link>
              <Link to="/account/notifications" className="um-drawer__link">
                <Bell size={16} aria-hidden="true" /> {t('notifications')}
              </Link>
            </div>
          )}

          <div className="um-drawer__section">
            <span className="um-drawer__label">{t('language')}</span>
            <LanguageSwitcher variant="list" />
          </div>

          {isAuthenticated && (
            <button type="button" className="um-drawer__link um-drawer__link--danger" onClick={() => setConfirmLogout(true)}>
              <LogOut size={16} aria-hidden="true" /> {t('logout')}
            </button>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={confirmLogout}
        title={t('logoutTitle')}
        message={t('logoutMessage')}
        confirmLabel={t('logout')}
        cancelLabel={t('logoutStay')}
        danger
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </>
  );
};

export default Navbar;
