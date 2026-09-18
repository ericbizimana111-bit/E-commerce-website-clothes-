import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../Context/CartContext';
import { useAuth } from '../Context/AuthContext';
import { useLanguage } from '../Context/LanguageContext';
import { formatUGX } from '../utils/currency';
import './Cart.css';

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80';

const Cart = () => {
  const { items, itemCount, subtotalUgx, updateQuantity, removeFromCart, clearCart, loading, error } = useCart();
  const { isAuthenticated } = useAuth();
  const { t, getLocalizedField } = useLanguage();
  const navigate = useNavigate();

  const handleCheckoutClick = () => {
    if (!isAuthenticated) {
      navigate('/login?redirect=/checkout');
    } else {
      navigate('/checkout');
    }
  };

  if (items.length === 0) {
    return (
      <div className="um-cart-page">
        <div className="container">
          <div className="um-empty-cart card">
            <span className="um-empty-icon">🧺</span>
            <h2>{t('emptyCart')}</h2>
            <p>{t('emptyCartDesc')}</p>
            <Link to="/catalog" className="btn btn-primary btn-lg">
              🛒 {t('startShopping')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Calculate commitment & balance estimations
  const estCommitment = Math.round(subtotalUgx * 0.10);
  const estBalance = subtotalUgx - estCommitment;

  return (
    <div className="um-cart-page">
      <div className="container">
        <div className="um-cart-header">
          <div>
            <h1 className="um-cart-title">{t('cart')}</h1>
            <p className="um-cart-subtitle">
              {itemCount} {itemCount === 1 ? 'item' : 'items'} in your farm basket
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm um-clear-cart-btn"
            onClick={clearCart}
            disabled={loading}
          >
            🗑️ Clear Cart
          </button>
        </div>

        {error && (
          <div className="alert alert-error">
            <span>⚠️ {error}</span>
          </div>
        )}

        <div className="um-cart-layout">
          {/* Items List */}
          <div className="um-cart-items card">
            <div className="um-cart-items-head">
              <span className="um-head-item">Produce</span>
              <span className="um-head-price">Price</span>
              <span className="um-head-qty">Quantity</span>
              <span className="um-head-subtotal">Subtotal</span>
              <span className="um-head-action" />
            </div>

            <div className="um-cart-items-list">
              {items.map((item) => {
                const product = item.product || {};
                const name = getLocalizedField(product, 'name') || product.name || 'Fresh Item';
                const unitPrice = item.unitPriceUgx || product.priceUgx || 0;
                const lineSubtotal = item.subtotalUgx || (unitPrice * item.quantity);
                const imageUrl = product.image || (product.images && product.images[0]?.imageUrl) || DEFAULT_IMAGE;
                const isItemOutOfStock = product.isActive === false || product.stockQuantity === 0;

                return (
                  <div key={item.id} className={`um-cart-row ${isItemOutOfStock ? 'um-cart-row--stale' : ''}`}>
                    <div className="um-cart-prod-cell">
                      <Link to={`/product/${product.id || item.productId}`} className="um-cart-thumb-wrap">
                        <img
                          src={imageUrl}
                          alt={name}
                          className="um-cart-thumb"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = DEFAULT_IMAGE;
                          }}
                        />
                      </Link>
                      <div className="um-cart-prod-info">
                        <Link to={`/product/${product.id || item.productId}`} className="um-cart-prod-name">
                          {name}
                        </Link>
                        <span className="um-cart-prod-unit">
                          {product.unit ? `Unit: per ${product.unit}` : ''}
                        </span>
                        {isItemOutOfStock && (
                          <span className="badge badge-danger">Out of Stock - Please remove</span>
                        )}
                      </div>
                    </div>

                    <div className="um-cart-price-cell">
                      <span className="um-cell-label">Unit Price: </span>
                      <strong>{formatUGX(unitPrice)}</strong>
                    </div>

                    <div className="um-cart-qty-cell">
                      <div className="um-cart-stepper">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={loading || item.quantity <= 1}
                          className="um-stepper-btn"
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <span className="um-stepper-val">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={loading || (product.stockQuantity && item.quantity >= product.stockQuantity)}
                          className="um-stepper-btn"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="um-cart-subtotal-cell">
                      <span className="um-cell-label">Total: </span>
                      <strong className="um-cart-line-total">{formatUGX(lineSubtotal)}</strong>
                    </div>

                    <div className="um-cart-action-cell">
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        disabled={loading}
                        className="um-remove-btn"
                        title="Remove item"
                        aria-label="Remove item"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="um-cart-footer-links">
              <Link to="/catalog" className="btn btn-secondary btn-sm">
                ← Continue Shopping
              </Link>
            </div>
          </div>

          {/* Cart Summary Card */}
          <div className="um-cart-summary card">
            <h3 className="um-summary-title">Order Summary</h3>

            <div className="um-summary-rows">
              <div className="um-summary-row">
                <span>Items Subtotal</span>
                <strong>{formatUGX(subtotalUgx)}</strong>
              </div>

              <div className="um-summary-row">
                <span>Fulfillment Fee</span>
                <span className="um-summary-muted">Calculated at checkout</span>
              </div>
            </div>

            {/* Transparent 10% / 90% breakdown */}
            <div className="um-summary-breakdown card">
              <div className="um-breakdown-row">
                <div>
                  <strong>Payable Now (10% Deposit)</strong>
                  <span>Commitment to harvest</span>
                </div>
                <strong className="um-highlight-deposit">{formatUGX(estCommitment)}</strong>
              </div>
              <div className="um-breakdown-divider" />
              <div className="um-breakdown-row">
                <div>
                  <strong>Payable on Delivery (90% Balance)</strong>
                  <span>After produce quality inspection</span>
                </div>
                <strong>{formatUGX(estBalance)}</strong>
              </div>
            </div>

            <div className="um-summary-total-box">
              <div className="um-summary-total-row">
                <span>Estimated Total</span>
                <span className="um-summary-total">{formatUGX(subtotalUgx)}</span>
              </div>
              <span className="um-summary-tax-note">Excludes optional doorstep delivery fee</span>
            </div>

            <button
              type="button"
              onClick={handleCheckoutClick}
              disabled={loading || items.length === 0}
              className="btn btn-primary btn-lg btn-block um-checkout-btn"
            >
              {isAuthenticated ? t('checkout') : 'Login & Checkout'} →
            </button>

            <div className="um-summary-guarantees">
              <div>🛡️ Quality guarantee on delivery</div>
              <div>⚡ Mobile Money payments (MTN / Airtel)</div>
              <div>📍 Home delivery or free station pickup</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;