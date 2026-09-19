import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../Context/CartContext';
import { useAuth } from '../Context/AuthContext';
import { useLanguage } from '../Context/LanguageContext';
import { formatUGX } from '../utils/currency';
import './Cart.css';

const DEFAULT_IMAGE = '/img-placeholder.svg';

const Cart = () => {
  const { items, itemCount, subtotalUgx, updateQuantity, removeFromCart, clearCart, loading, error, refreshCart } = useCart();
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
          <div className="alert alert-error" role="alert">
            <span>⚠️ {error}</span>
            <button onClick={refreshCart} className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }}>
              Retry
            </button>
          </div>
        )}

        <div className="um-cart-layout">
          {/* Items List */}
          <div className="um-cart-items card">
            <div className="um-cart-items-head">
              <span className="um-head-item">Product</span>
              <span className="um-head-price">Price</span>
              <span className="um-head-qty">Quantity</span>
              <span className="um-head-subtotal">Subtotal</span>
              <span className="um-head-action" />
            </div>

            <div className="um-cart-items-list">
              {items.map((item) => {
                const product = item.product || {};
                const name = getLocalizedField(product, 'name') || product.name || 'Fresh Item';
                // The current DB price (unitPriceUgx) is authoritative; the
                // backend flags priceIsStale when the cart snapshot differs.
                const unitPrice = item.unitPriceUgx || product.priceUgx || 0;
                const lineSubtotal = item.subtotalUgx || (unitPrice * item.quantity);
                const imageUrl = product.image || (product.images && product.images[0]?.imageUrl) || DEFAULT_IMAGE;
                const availability = item.availability || {};
                const outOfStock = availability.isActive === false || availability.inStock === false;
                const insufficient = availability.sufficientStock === false && !outOfStock;
                const hasProblem = outOfStock || insufficient || item.priceIsStale;

                return (
                  <div key={item.id} className={`um-cart-row ${hasProblem ? 'um-cart-row--stale' : ''}`}>
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
                        {item.priceIsStale && (
                          <span className="badge badge-warning">Price changed — current price applies</span>
                        )}
                        {outOfStock && (
                          <span className="badge badge-danger">Out of Stock — please remove</span>
                        )}
                        {insufficient && (
                          <span className="badge badge-warning">
                            Only {availability.stockQuantity} available in stock
                          </span>
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
                          disabled={loading || (availability.stockQuantity && item.quantity >= availability.stockQuantity)}
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
                <span>{t('deliveryFee')}</span>
                <span className="um-summary-muted">Calculated at checkout</span>
              </div>
            </div>

            <div className="um-summary-total-box">
              <div className="um-summary-total-row">
                <span>Estimated Total</span>
                <span className="um-summary-total">{formatUGX(subtotalUgx)}</span>
              </div>
              <span className="um-summary-tax-note">
                Final total, delivery fee and commitment deposit are calculated by the UgaMarket server at checkout.
              </span>
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
              <div>📍 Home delivery or station pickup</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
