import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import './Footer.css';

// Official UgaMarket brand asset (frontend/public/logo.png)
const LOGO_SRC = `${process.env.PUBLIC_URL}/logo.png`;

// Fallback used only if the category API is unreachable — these slugs mirror
// the backend seed so links remain valid (directive: no dead links).
const FALLBACK_CATEGORIES = [
  { id: 'f1', slug: 'matooke-tubers', name: 'Matooke & Tubers' },
  { id: 'f2', slug: 'grains-cereals', name: 'Grains & Cereals' },
  { id: 'f3', slug: 'fresh-vegetables', name: 'Fresh Greens & Vegetables' },
  { id: 'f4', slug: 'fresh-fruits', name: 'Fresh Fruits' }
];

const Footer = () => {
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);

  useEffect(() => {
    let isMounted = true;
    const loadCategories = async () => {
      try {
        // GET /api/categories -> [{ id, slug, name, ... }]
        const res = await apiClient.get('/categories');
        if (isMounted && Array.isArray(res?.data) && res.data.length > 0) {
          setCategories(res.data.slice(0, 4));
        }
      } catch {
        // Keep fallback slugs on failure; footer must always render.
      }
    };
    loadCategories();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <footer className="um-footer">
      <div className="um-footer-container">
        {/* Main Footer Grid */}
        <div className="um-footer-grid">
          {/* Brand Col */}
          <div className="um-footer-brand">
            <Link to="/" className="um-footer-logo">
              <img
                src={LOGO_SRC}
                alt="UgaMarket — home to home"
                className="um-footer-logo-img"
                width="150"
                height="42"
              />
            </Link>
            <p className="um-footer-desc">
              Direct-from-farm Ugandan food marketplace. Delivering fresh matooke, cereals, beans, and fresh harvest to homes and local pickup stations across Uganda.
            </p>
            <div className="um-footer-trust-badges">
              <span className="um-trust-pill">🇺🇬 Local Ugandan Farmers</span>
              <span className="um-trust-pill">🛡️ Quality Inspection on Fulfillment</span>
              <span className="um-trust-pill">💵 Small Deposit First, Balance at Fulfillment</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="um-footer-col">
            <h4 className="um-footer-heading">Shop</h4>
            <ul className="um-footer-links">
              <li><Link to="/catalog">All Fresh Food</Link></li>
              {categories.map((cat) => (
                <li key={cat.id}>
                  <Link to={`/catalog?category=${cat.slug}`}>{cat.name}</Link>
                </li>
              ))}
              <li><Link to="/pickup-stations">Pickup Stations</Link></li>
            </ul>
          </div>

          {/* Account & Support */}
          <div className="um-footer-col">
            <h4 className="um-footer-heading">Account</h4>
            <ul className="um-footer-links">
              <li><Link to="/login">Login</Link></li>
              <li><Link to="/login?signup=true">Create Account</Link></li>
              <li><Link to="/account/orders">My Orders</Link></li>
              <li><Link to="/account/addresses">Saved Addresses</Link></li>
              <li><Link to="/account/notifications">Notifications</Link></li>
            </ul>
          </div>

          {/* Help */}
          <div className="um-footer-col">
            <h4 className="um-footer-heading">Customer Support</h4>
            <ul className="um-footer-links">
              <li><Link to="/how-it-works">How UgaMarket Works</Link></li>
              <li><Link to="/how-it-works">Commitment Deposit Explained</Link></li>
              <li><Link to="/pickup-stations">Find a Pickup Station</Link></li>
            </ul>
            <div className="um-footer-contact-info">
              <div>📍 Kampala, Uganda</div>
              <div>📞 +256 700 123 456</div>
              <div>✉️ support@ugamarket.ug</div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="um-footer-bottom">
          <p>© {new Date().getFullYear()} UgaMarket — home to home. All rights reserved.</p>
          <div className="um-footer-bottom-links">
            <span>Prices displayed in UGX</span>
            <span aria-hidden="true">•</span>
            <span>Pay a small commitment deposit now</span>
            <span aria-hidden="true">•</span>
            <span>Inspect your order, then pay the balance</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
