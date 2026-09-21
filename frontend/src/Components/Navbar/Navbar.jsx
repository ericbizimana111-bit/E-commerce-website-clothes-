import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../Context/AuthContext';
import { useCart } from '../../Context/CartContext';
import { useLanguage, SUPPORTED_LANGUAGES } from '../../Context/LanguageContext';
import {
  ShoppingCart, User, ChevronDown, Package, MapPin, Bell,
  LogOut, Home, BookOpen, Search, X, Globe, Menu, HelpCircle,
} from 'lucide-react';
import './Navbar.css';

const LOGO_SRC = `${process.env.PUBLIC_URL}/logo.png`;

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
          <span>Fresh Farm Harvests Direct to You &bull; Small Commitment Deposit &bull; Inspect Before You Pay the Balance</span>
          <div className="um-topbar-right">
            <span className="um-tagline-pill">home to home</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <header className="um-header">
        <div className="um-nav-container">
          <Link to="/" className="um-logo" onClick={closeMobileMenu}>
            <img
              src={LOGO_SRC}
              alt="UgaMarket — home to home"
              className="um-logo-img"
              width="156"
              height="44"
            />
          </Link>

          {/* Desktop Search Bar */}
          <form className="um-search-form" onSubmit={handleSearchSubmit}>
            <Search className="um-search-icon" size={16} strokeWidth={2} />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="um-search-input"
            />
            {searchQuery && (
              <button type="button" className="um-search-clear" onClick={() => setSearchQuery('')}>
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </form>

          {/* Primary Nav Links */}
          <nav className="um-links">
            <Link to="/" className={`um-nav-link ${location.pathname === '/' ? 'um-nav-link--active' : ''}`}>
              {t('home')}
            </Link>
            <Link to="/catalog" className={`um-nav-link ${location.pathname.startsWith('/catalog') ? 'um-nav-link--active' : ''}`}>
              {t('catalog')}
            </Link>
            <Link to="/pickup-stations" className={`um-nav-link ${location.pathname === '/pickup-stations' ? 'um-nav-link--active' : ''}`}>
              {t('pickupStation')}s
            </Link>
          </nav>

          {/* Action Tools */}
          <div className="um-actions">
            {/* Mobile Search Toggle */}
            <button className="um-icon-btn um-mobile-search-btn" onClick={() => setIsSearchOpen(!isSearchOpen)} aria-label="Search">
              <Search size={20} strokeWidth={1.75} />
            </button>

            {/* Language Selector */}
            <div className="um-dropdown-container" ref={langMenuRef}>
              <button className="um-lang-btn" onClick={() => setIsLangMenuOpen(!isLangMenuOpen)} aria-label="Select language">
                <Globe size={14} strokeWidth={2} />
                <span className="um-lang-code">{activeLangObj.code.toUpperCase()}</span>
                <ChevronDown size={12} strokeWidth={2} />
              </button>

              {isLangMenuOpen && (
                <div className="um-dropdown-menu um-lang-menu">
                  <div className="um-dropdown-header">Select Language</div>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      className={`um-dropdown-item ${currentLang === lang.code ? 'um-dropdown-item--active' : ''}`}
                      onClick={() => { changeLanguage(lang.code); setIsLangMenuOpen(false); }}
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
              <ShoppingCart size={22} strokeWidth={1.75} />
              {itemCount > 0 && <span className="um-cart-badge">{itemCount}</span>}
            </Link>

            {/* User Account / Auth */}
            {isAuthenticated ? (
              <div className="um-dropdown-container" ref={userMenuRef}>
                <button className="um-user-btn" onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} aria-label="User profile">
                  <div className="um-avatar">
                    {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <span className="um-username">{user?.fullName?.split(' ')[0] || 'Customer'}</span>
                  <ChevronDown size={14} strokeWidth={2} />
                </button>

                {isUserMenuOpen && (
                  <div className="um-dropdown-menu um-user-menu">
                    <div className="um-dropdown-profile">
                      <strong>{user?.fullName || 'Customer'}</strong>
                      <span>{user?.phone}</span>
                    </div>
                    <div className="um-dropdown-divider" />
                    <Link to="/account/orders" className="um-dropdown-item" onClick={() => setIsUserMenuOpen(false)}>
                      <Package size={15} strokeWidth={1.75} /> {t('orders')}
                    </Link>
                    <Link to="/account/addresses" className="um-dropdown-item" onClick={() => setIsUserMenuOpen(false)}>
                      <MapPin size={15} strokeWidth={1.75} /> {t('addresses')}
                    </Link>
                    <Link to="/account/notifications" className="um-dropdown-item" onClick={() => setIsUserMenuOpen(false)}>
                      <Bell size={15} strokeWidth={1.75} /> {t('notifications')}
                    </Link>
                    <div className="um-dropdown-divider" />
                    <button className="um-dropdown-item um-dropdown-item--danger" onClick={handleLogout}>
                      <LogOut size={15} strokeWidth={1.75} /> {t('logout')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="um-auth-buttons">
                <Link to="/login" className="btn btn-sm btn-secondary">{t('login')}</Link>
                <Link to="/login?signup=true" className="btn btn-sm btn-primary">{t('signup')}</Link>
              </div>
            )}

            {/* Mobile Hamburger Button */}
            <button
              className={`um-hamburger ${isMobileMenuOpen ? 'um-hamburger--open' : ''}`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
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
              <button type="submit" className="btn btn-primary btn-sm">Search</button>
              <button type="button" className="um-mobile-search-close" onClick={() => setIsSearchOpen(false)}>
                <X size={18} strokeWidth={2} />
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Mobile Drawer */}
      <div className={`um-drawer-backdrop ${isMobileMenuOpen ? 'um-drawer-backdrop--open' : ''}`} onClick={closeMobileMenu} />
      <div className={`um-mobile-drawer ${isMobileMenuOpen ? 'um-mobile-drawer--open' : ''}`}>
        <div className="um-drawer-header">
          <Link to="/" className="um-logo" onClick={closeMobileMenu}>
            <img src={LOGO_SRC} alt="UgaMarket — home to home" className="um-logo-img" width="132" height="38" />
          </Link>
          <button className="um-drawer-close" onClick={closeMobileMenu}>
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="um-drawer-content">
          <div className="um-drawer-section">
            <div className="um-drawer-label">Browse</div>
            <Link to="/" className="um-drawer-link" onClick={closeMobileMenu}>
              <Home size={16} strokeWidth={1.75} /> {t('home')}
            </Link>
            <Link to="/catalog" className="um-drawer-link" onClick={closeMobileMenu}>
              <BookOpen size={16} strokeWidth={1.75} /> {t('catalog')}
            </Link>
            <Link to="/pickup-stations" className="um-drawer-link" onClick={closeMobileMenu}>
              <MapPin size={16} strokeWidth={1.75} /> {t('pickupStation')}s
            </Link>
            <Link to="/how-it-works" className="um-drawer-link" onClick={closeMobileMenu}>
              <HelpCircle size={16} strokeWidth={1.75} /> {t('howItWorks')}
            </Link>
          </div>

          <div className="um-drawer-section">
            <div className="um-drawer-label">Language</div>
            <div className="um-drawer-langs">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  className={`um-drawer-lang-btn ${currentLang === lang.code ? 'um-drawer-lang-btn--active' : ''}`}
                  onClick={() => { changeLanguage(lang.code); closeMobileMenu(); }}
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
                  <Package size={16} strokeWidth={1.75} /> {t('orders')}
                </Link>
                <Link to="/account/addresses" className="um-drawer-link" onClick={closeMobileMenu}>
                  <MapPin size={16} strokeWidth={1.75} /> {t('addresses')}
                </Link>
                <Link to="/account/notifications" className="um-drawer-link" onClick={closeMobileMenu}>
                  <Bell size={16} strokeWidth={1.75} /> {t('notifications')}
                </Link>
                <button className="um-drawer-link um-drawer-link--danger" onClick={handleLogout}>
                  <LogOut size={16} strokeWidth={1.75} /> {t('logout')}
                </button>
              </>
            ) : (
              <div className="um-drawer-auth-buttons">
                <Link to="/login" className="btn btn-secondary btn-block" onClick={closeMobileMenu}>{t('login')}</Link>
                <Link to="/login?signup=true" className="btn btn-primary btn-block" onClick={closeMobileMenu}>{t('signup')}</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
