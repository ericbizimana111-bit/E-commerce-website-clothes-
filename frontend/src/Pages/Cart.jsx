import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBasket,
  ShoppingCart,
  Trash2,
  Wallet,
  X
} from 'lucide-react';
import { useCart } from '../Context/CartContext';
import { useAuth } from '../Context/AuthContext';
import { useLanguage } from '../Context/LanguageContext';
import ConfirmDialog from '../Components/ui/ConfirmDialog';
import { resolveImageUrl } from '../api/client';
import { formatUGX } from '../utils/currency';
import './Cart.css';

const DEFAULT_IMAGE = '/img-placeholder.svg';

const Cart = () => {
  const { items, itemCount, subtotalUgx, updateQuantity, removeFromCart, clearCart, loading, error, refreshCart } = useCart();
  const { isAuthenticated } = useAuth();
  const { t, getLocalizedField } = useLanguage();
  const navigate = useNavigate();
  const [confirmClear, setConfirmClear] = useState(false);

  const handleCheckout = () => navigate(isAuthenticated ? '/checkout' : '/login?redirect=/checkout');

  if (items.length === 0) {
    return (
      <div className="cart container">
        <div className="state-block panel cart__empty">
          <span className="state-block__icon">
            <ShoppingBasket size={40} strokeWidth={1.3} aria-hidden="true" />
          </span>
          <h1>{t('emptyCart')}</h1>
          <p>{t('emptyCartDesc')}</p>
          <Link to="/catalog" className="btn btn-primary btn-lg">
            <ShoppingCart size={18} aria-hidden="true" />
            {t('startShopping')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cart container">
      <header className="cart__head">
        <div>
          <h1 className="page-title">{t('cart')}</h1>
          <p className="section-desc" role="status">
            {t('cartSubtitle', { count: itemCount })}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmClear(true)} disabled={loading}>
          <Trash2 size={15} aria-hidden="true" /> {t('clearCart')}
        </button>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={refreshCart} className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }}>
            <RefreshCw size={13} aria-hidden="true" /> {t('retry')}
          </button>
        </div>
      )}

      <div className="cart__layout">
        <section className="cart__items panel" aria-label={t('cart')}>
          <div className="cart__cols" aria-hidden="true">
            <span>{t('colProduct')}</span>
            <span>{t('colPrice')}</span>
            <span>{t('colQuantity')}</span>
            <span>{t('colSubtotal')}</span>
            <span />
          </div>

          <ul>
            {items.map((item) => {
              const product = item.product || {};
              const name = getLocalizedField(product, 'name') || product.name || t('freshItem');
              const unitPrice = item.unitPriceUgx || product.priceUgx || 0;
              const lineTotal = item.subtotalUgx || unitPrice * item.quantity;
              const image = resolveImageUrl(product.image || product.images?.[0]?.imageUrl) || DEFAULT_IMAGE;
              const availability = item.availability || {};
              const outOfStock = availability.isActive === false || availability.inStock === false;
              const insufficient = availability.sufficientStock === false && !outOfStock;
              const atMax = availability.stockQuantity && item.quantity >= availability.stockQuantity;
              const link = `/product/${product.id || item.productId}`;

              return (
                <li key={item.id} className={`cart__row ${outOfStock || insufficient || item.priceIsStale ? 'cart__row--flag' : ''}`}>
                  <div className="cart__prod">
                    <Link to={link} className="cart__thumb">
                      <img
                        src={image}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = DEFAULT_IMAGE;
                        }}
                      />
                    </Link>
                    <div className="cart__prod-info">
                      <Link to={link} className="cart__name">
                        {name}
                      </Link>
                      {product.unit && <span className="cart__unit">{t('unitPer', { unit: product.unit })}</span>}
                      {item.priceIsStale && <span className="badge badge-warning">{t('priceChanged')}</span>}
                      {outOfStock && <span className="badge badge-danger">{t('outOfStockRemove')}</span>}
                      {insufficient && <span className="badge badge-warning">{t('onlyNAvailable', { n: availability.stockQuantity })}</span>}
                    </div>
                  </div>

                  <div className="cart__price" data-label={t('unitPrice')}>
                    {formatUGX(unitPrice)}
                  </div>

                  <div className="cart__qty">
                    <div className="qty qty--sm" role="group" aria-label={`${t('colQuantity')}: ${name}`}>
                      <button type="button" className="qty__btn" onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={loading || item.quantity <= 1} aria-label={t('decreaseQty')}>
                        <Minus size={15} aria-hidden="true" />
                      </button>
                      <span className="qty__value" aria-live="polite">
                        {item.quantity}
                      </span>
                      <button type="button" className="qty__btn" onClick={() => updateQuantity(item.id, item.quantity + 1)} disabled={loading || atMax} aria-label={t('increaseQty')}>
                        <Plus size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="cart__total" data-label={t('lineTotal')}>
                    {formatUGX(lineTotal)}
                  </div>

                  <button type="button" onClick={() => removeFromCart(item.id)} disabled={loading} className="cart__remove" aria-label={`${t('removeItem')}: ${name}`}>
                    <X size={17} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="cart__foot">
            <Link to="/catalog" className="btn btn-secondary btn-sm">
              <ArrowLeft size={15} aria-hidden="true" /> {t('continueShopping')}
            </Link>
          </div>
        </section>

        <aside className="cart__summary panel" aria-label={t('orderSummary')}>
          <h2>{t('orderSummary')}</h2>

          <dl className="cart__rows">
            <div>
              <dt>{t('itemsSubtotal')}</dt>
              <dd>{formatUGX(subtotalUgx)}</dd>
            </div>
            <div>
              <dt>{t('deliveryFee')}</dt>
              <dd className="cart__muted">{t('calculatedAtCheckout')}</dd>
            </div>
          </dl>

          <div className="cart__grand">
            <span>{t('estimatedTotal')}</span>
            <strong>{formatUGX(subtotalUgx)}</strong>
          </div>
          <p className="cart__fine">{t('totalsNote')}</p>

          <button type="button" onClick={handleCheckout} disabled={loading} className="btn btn-primary btn-lg btn-block">
            {isAuthenticated ? t('checkout') : t('loginAndCheckout')} <ArrowRight size={18} aria-hidden="true" className="btn__nudge" />
          </button>

          <ul className="cart__guarantees">
            <li>
              <ShieldCheck size={16} aria-hidden="true" /> {t('guaranteeQuality')}
            </li>
            <li>
              <Wallet size={16} aria-hidden="true" /> {t('guaranteePay')}
            </li>
            <li>
              <MapPin size={16} aria-hidden="true" /> {t('guaranteeFulfil')}
            </li>
          </ul>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title={t('clearCartTitle')}
        message={t('clearCartMessage')}
        confirmLabel={t('clearCart')}
        danger
        onConfirm={() => {
          clearCart();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
};

export default Cart;
