import './Navbar.css'
import logo from '../Assets/logo.svg'
import { useContext, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShopContext } from '../../Context/ShopContext';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { getTotalCartItems } = useContext(ShopContext);
  const location = useLocation();
  const isLoggedIn = !!localStorage.getItem('auth-token');
  const cartCount = getTotalCartItems();

  const toggleMenu = () => setIsMenuOpen(prev => !prev);
  const handleMenuClick = () => {
    setIsMenuOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <>
      <div className="nb-topbar">
        <p>Free shipping on orders over $50 &mdash; Use code <strong>SHINE</strong> at checkout</p>
      </div>

      <nav className={`nb ${isMenuOpen ? 'nb--menu-open' : ''}`}>
        <div className="nb-inner">
          <Link to="/" className="nb-logo" onClick={handleMenuClick}>
            <div className="nb-logo-icon">
              <img src={logo} alt="" />
            </div>
            <span className="nb-logo-text">SHOPPER</span>
          </Link>

          <ul className="nb-links">
            <li><Link to="/" className={`nb-link ${location.pathname === '/' ? 'nb-link--active' : ''}`} onClick={handleMenuClick}>Shop</Link></li>
            <li><Link to="/mens" className={`nb-link ${location.pathname === '/mens' ? 'nb-link--active' : ''}`} onClick={handleMenuClick}>Men</Link></li>
            <li><Link to="/womens" className={`nb-link ${location.pathname === '/womens' ? 'nb-link--active' : ''}`} onClick={handleMenuClick}>Women</Link></li>
            <li><Link to="/kids" className={`nb-link ${location.pathname === '/kids' ? 'nb-link--active' : ''}`} onClick={handleMenuClick}>Kids</Link></li>
          </ul>

          <div className="nb-actions">
            <button className="nb-icon-btn" onClick={() => setIsSearchOpen(!isSearchOpen)} aria-label="Search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>

            {isLoggedIn ? (
              <button className="nb-icon-btn" onClick={() => { localStorage.removeItem('auth-token'); window.location.replace('/'); }} aria-label="Logout">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
            ) : (
              <Link to="/login" className="nb-icon-btn" aria-label="Login">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </Link>
            )}

            <Link to="/cart" className="nb-icon-btn nb-cart-btn" aria-label="Cart">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              {cartCount > 0 && <span className="nb-cart-badge">{cartCount}</span>}
            </Link>

            <button className={`nb-hamburger ${isMenuOpen ? 'nb-hamburger--open' : ''}`} onClick={toggleMenu} aria-label="Toggle menu" aria-expanded={isMenuOpen}>
              <span /><span /><span />
            </button>
          </div>
        </div>

        <div className={`nb-search ${isSearchOpen ? 'nb-search--open' : ''}`}>
          <div className="nb-search-inner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search for products, categories..." />
            <button className="nb-search-close" onClick={() => setIsSearchOpen(false)}>&#10005;</button>
          </div>
        </div>
      </nav>

      <div className={`nb-overlay ${isMenuOpen ? 'nb-overlay--open' : ''}`} onClick={handleMenuClick} />

      <div className={`nb-mobile ${isMenuOpen ? 'nb-mobile--open' : ''}`}>
        <div className="nb-mobile-header">
          <span className="nb-mobile-title">Menu</span>
          <button className="nb-mobile-close" onClick={handleMenuClick}>&#10005;</button>
        </div>
        <ul className="nb-mobile-links">
          <li><Link to="/" className={location.pathname === '/' ? 'nb-mobile-link--active' : ''} onClick={handleMenuClick}><span className="nb-mobile-link-icon">&#128722;</span> Shop All</Link></li>
          <li><Link to="/mens" className={location.pathname === '/mens' ? 'nb-mobile-link--active' : ''} onClick={handleMenuClick}><span className="nb-mobile-link-icon">&#128084;</span> Men</Link></li>
          <li><Link to="/womens" className={location.pathname === '/womens' ? 'nb-mobile-link--active' : ''} onClick={handleMenuClick}><span className="nb-mobile-link-icon">&#128087;</span> Women</Link></li>
          <li><Link to="/kids" className={location.pathname === '/kids' ? 'nb-mobile-link--active' : ''} onClick={handleMenuClick}><span className="nb-mobile-link-icon">&#129528;</span> Kids</Link></li>
        </ul>
        <div className="nb-mobile-footer">
          {isLoggedIn ? (
            <button className="nb-mobile-auth" onClick={() => { localStorage.removeItem('auth-token'); window.location.replace('/'); }}>Logout</button>
          ) : (
            <Link to="/login" className="nb-mobile-auth" onClick={handleMenuClick}>Login / Sign Up</Link>
          )}
        </div>
      </div>
    </>
  );
};

export default Navbar;
