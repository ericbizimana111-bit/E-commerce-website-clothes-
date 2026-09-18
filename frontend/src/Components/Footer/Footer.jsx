import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (email && email.includes('@')) {
      setSubscribed(true);
      setEmail('');
    }
  };

  return (
    <footer className="um-footer">
      <div className="um-footer-container">
        {/* Main Footer Grid */}
        <div className="um-footer-grid">
          {/* Brand Col */}
          <div className="um-footer-brand">
            <Link to="/" className="um-footer-logo">
              <div className="um-footer-logo-badge">🌿</div>
              <div>
                <span className="um-footer-brand-title">UgaMarket</span>
                <span className="um-footer-brand-sub">home to home</span>
              </div>
            </Link>
            <p className="um-footer-desc">
              Direct-from-farm Ugandan food marketplace. Delivering fresh matooke, cereals, beans, and fresh harvest to homes and local pickup stations across Uganda.
            </p>
            <div className="um-footer-trust-badges">
              <span className="um-trust-pill">🇺🇬 100% Local Ugandan Farmers</span>
              <span className="um-trust-pill">🛡️ Quality Inspected Produce</span>
              <span className="um-trust-pill">💵 Pay 10% First, 90% at Fulfillment</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="um-footer-col">
            <h4 className="um-footer-heading">Fresh Food Categories</h4>
            <ul className="um-footer-links">
              <li><Link to="/catalog?category=matooke-bananas">Matooke & Plantains</Link></li>
              <li><Link to="/catalog?category=grains-cereals">Grains & Flour (Kawunga)</Link></li>
              <li><Link to="/catalog?category=legumes-beans">Legumes & Yellow Beans</Link></li>
              <li><Link to="/catalog?category=tubers-roots">Tubers, Cassava & Sweet Potatoes</Link></li>
              <li><Link to="/catalog?category=fresh-vegetables">Fresh Greens & Vegetables</Link></li>
            </ul>
          </div>

          {/* Fulfillment & Info */}
          <div className="um-footer-col">
            <h4 className="um-footer-heading">Marketplace & Delivery</h4>
            <ul className="um-footer-links">
              <li><Link to="/pickup-stations">Pickup Stations in Kampala</Link></li>
              <li><Link to="/catalog">Browse All Harvests</Link></li>
              <li><Link to="/how-it-works">How 10% Commitment Works</Link></li>
              <li><Link to="/account/orders">Track My Order</Link></li>
              <li><Link to="/account/addresses">Saved Delivery Addresses</Link></li>
            </ul>
          </div>

          {/* Newsletter / Contact */}
          <div className="um-footer-col">
            <h4 className="um-footer-heading">Weekly Farm Updates</h4>
            <p className="um-footer-newsletter-text">
              Subscribe to get seasonal farm price drops and fresh harvest arrivals every Friday.
            </p>
            {subscribed ? (
              <div className="um-footer-subscribed">
                ✓ Thank you for subscribing!
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="um-footer-newsletter-form">
                <input
                  type="email"
                  placeholder="Enter your email or phone"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button type="submit" className="btn btn-primary btn-sm">
                  Subscribe
                </button>
              </form>
            )}
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
            <span>•</span>
            <span>Terms of Service</span>
            <span>•</span>
            <span>Privacy Policy</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;