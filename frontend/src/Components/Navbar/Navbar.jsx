import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../Context/AuthContext';
import { useCart } from '../../Context/CartContext';
import { useLanguage, SUPPORTED_LANGUAGES } from '../../Context/LanguageContext';
import './Navbar.css';

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  const { user, isAuthenticated, logout } = useAuth();
  const { itemCount } = useCart();
  const { currentLang, changeLanguage, t } = useLanguage();

  const location = useLocation();
  const navigate = useNavigate();
  const userMenuRef = useRef(null);
  const langMenuRef = useRef(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(event.target)) {
        setIsLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/catalog?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
      setIsMobileMenuOpen(false);
    }
  };

  const handleLogout = () => {
    logout();
    setIsUserMenuOpen(false);
    setIsMobileMenuOpen(false);
    navigate('/');
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const activeLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === currentLang) || SUPPORTED_LANGUAGES[0];

  return (
    <>
      {/* Top Banner */}
      <div className="um-topbar">
        <div className="um-topbar-inner">
          <span>🇺🇬 Fresh Farm Harvests Direct to You • Small Commitment Deposit • Quality Guaranteed</span>
          <div className="um-topbar-right">
            <span className="um-tagline-pill">home to home</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <header className="um-header">
        <div className="um-nav-container">
          {/* Brand Logo */}
          <Link to="/" className="um-logo" onClick={closeMobileMenu}>
            <div className="um-logo-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="um-logo-text">
              <span className="um-logo-title">UgaMarket</span>
              <span className="um-logo-sub">home to home</span>
            </div>
          </Link>

          {/* Desktop Search Bar */}
          <form className="um-search-form" onSubmit={handleSearchSubmit}>
            <svg className="um-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="um-search-input"
            />
            {searchQuery && (
              <button type="button" className="um-search-clear" onClick={() => setSearchQuery('')}>
                ×
              </button>
            )}
          </form>

          {/* Primary Nav Links */}
          <nav className="um-links">
            <Link
              to="/"
              className={`um-nav-link ${location.pathname === '/' ? 'um-nav-link--active' : ''}`}
            >
              {t('home')}
            </Link>
            <Link
              to="/catalog"
              className={`um-nav-link ${location.pathname.startsWith('/catalog') ? 'um-nav-link--active' : ''}`}
            >
              {t('catalog')}
            </Link>
            <Link
              to="/pickup-stations"
              className={`um-nav-link ${location.pathname === '/pickup-stations' ? 'um-nav-link--active' : ''}`}
            >
              {t('pickupStation')}s
            </Link>
          </nav>

          {/* Action Tools */}
          <div className="um-actions">
            {/* Mobile Search Toggle */}
            <button
              className="um-icon-btn um-mobile-search-btn"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              aria-label="Search"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            {/* Language Selector */}
            <div className="um-dropdown-container" ref={langMenuRef}>
              <button
                className="um-lang-btn"
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                aria-label="Select language"
              >
                <span className="um-lang-flag">{activeLangObj.flag}</span>
                <span className="um-lang-code">{activeLangObj.code.toUpperCase()}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isLangMenuOpen && (
                <div className="um-dropdown-menu um-lang-menu">
                  <div className="um-dropdown-header">Select Language</div>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      className={`um-dropdown-item ${currentLang === lang.code ? 'um-dropdown-item--active' : ''}`}
                      onClick={() => {
                        changeLanguage(lang.code);
                        setIsLangMenuOpen(false);
                      }}
                    >
                      <span className="um-lang-item-flag">{lang.flag}</span>
                      <span className="um-lang-item-name">{lang.name}</span>
                      <span className="um-lang-item-code">({lang.code.toUpperCase()})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Icon */}
            <Link to="/cart" className="um-icon-btn um-cart-btn" aria-label="Cart">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              {itemCount > 0 && <span className="um-cart-badge">{itemCount}</span>}
            </Link>

            {/* User Account / Auth */}
            {isAuthenticated ? (
              <div className="um-dropdown-container" ref={userMenuRef}>
                <button
                  className="um-user-btn"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  aria-label="User profile"
                >
                  <div className="um-avatar">
                    {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <span className="um-username">{user?.fullName?.split(' ')[0] || 'Customer'}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isUserMenuOpen && (
                  <div className="um-dropdown-menu um-user-menu">
                    <div className="um-dropdown-profile">
                      <strong>{user?.fullName || 'Customer'}</strong>
                      <span>{user?.phone}</span>
                    </div>
                    <div className="um-dropdown-divider" />
                    <Link
                      to="/account/orders"
                      className="um-dropdown-item"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      📦 {t('orders')}
                    </Link>
                    <Link
                      to="/account/addresses"
                      className="um-dropdown-item"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      📍 {t('addresses')}
                    </Link>
                    <Link
                      to="/account/notifications"
                      className="um-dropdown-item"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      🔔 {t('notifications')}
                    </Link>
                    <div className="um-dropdown-divider" />
                    <button
                      className="um-dropdown-item um-dropdown-item--danger"
                      onClick={handleLogout}
                    >
                      🚪 {t('logout')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="um-auth-buttons">
                <Link to="/login" className="btn btn-sm btn-secondary">
                  {t('login')}
                </Link>
                <Link to="/login?signup=true" className="btn btn-sm btn-primary">
                  {t('signup')}
                </Link>
              </div>
            )}

            {/* Mobile Hamburger Button */}
            <button
              className={`um-hamburger ${isMobileMenuOpen ? 'um-hamburger--open' : ''}`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        {/* Mobile Search Overlay */}
        {isSearchOpen && (
          <div className="um-mobile-search-bar">
            <form onSubmit={handleSearchSubmit} className="um-mobile-search-form">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-primary btn-sm">
                Search
              </button>
              <button
                type="button"
                className="um-mobile-search-close"
                onClick={() => setIsSearchOpen(false)}
              >
                ✕
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Mobile Drawer */}
      <div
        className={`um-drawer-backdrop ${isMobileMenuOpen ? 'um-drawer-backdrop--open' : ''}`}
        onClick={closeMobileMenu}
      />
      <div className={`um-mobile-drawer ${isMobileMenuOpen ? 'um-mobile-drawer--open' : ''}`}>
        <div className="um-drawer-header">
          <div className="um-logo">
            <div className="um-logo-badge">🌿</div>
            <div className="um-logo-text">
              <span className="um-logo-title">UgaMarket</span>
              <span className="um-logo-sub">home to home</span>
            </div>
          </div>
          <button className="um-drawer-close" onClick={closeMobileMenu}>
            ✕
          </button>
        </div>

        <div className="um-drawer-content">
          <div className="um-drawer-section">
            <div className="um-drawer-label">Browse</div>
            <Link to="/" className="um-drawer-link" onClick={closeMobileMenu}>
              🏡 {t('home')}
            </Link>
            <Link to="/catalog" className="um-drawer-link" onClick={closeMobileMenu}>
              🧺 {t('catalog')}
            </Link>
            <Link to="/pickup-stations" className="um-drawer-link" onClick={closeMobileMenu}>
              📍 {t('pickupStation')}s
            </Link>
            <Link to="/how-it-works" className="um-drawer-link" onClick={closeMobileMenu}>
              💡 {t('howItWorks')}
            </Link>
          </div>

          <div className="um-drawer-section">
            <div className="um-drawer-label">Language</div>
            <div className="um-drawer-langs">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  className={`um-drawer-lang-btn ${currentLang === lang.code ? 'um-drawer-lang-btn--active' : ''}`}
                  onClick={() => {
                    changeLanguage(lang.code);
                    closeMobileMenu();
                  }}
                >
                  {lang.flag} {lang.name}
                </button>
              ))}
            </div>
          </div>

          <div className="um-drawer-section">
            <div className="um-drawer-label">Account</div>
            {isAuthenticated ? (
              <>
                <div className="um-drawer-user-info">
                  <strong>{user?.fullName}</strong>
                  <span>{user?.phone}</span>
                </div>
                <Link to="/account/orders" className="um-drawer-link" onClick={closeMobileMenu}>
                  📦 {t('orders')}
                </Link>
                <Link to="/account/addresses" className="um-drawer-link" onClick={closeMobileMenu}>
                  📍 {t('addresses')}
                </Link>
                <Link to="/account/notifications" className="um-drawer-link" onClick={closeMobileMenu}>
                  🔔 {t('notifications')}
                </Link>
                <button className="um-drawer-link um-drawer-link--danger" onClick={handleLogout}>
                  🚪 {t('logout')}
                </button>
              </>
            ) : (
              <div className="um-drawer-auth-buttons">
                <Link to="/login" className="btn btn-secondary btn-block" onClick={closeMobileMenu}>
                  {t('login')}
                </Link>
                <Link to="/login?signup=true" className="btn btn-primary btn-block" onClick={closeMobileMenu}>
                  {t('signup')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
