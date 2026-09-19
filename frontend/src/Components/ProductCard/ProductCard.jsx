import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../Context/CartContext';
import { useLanguage } from '../../Context/LanguageContext';
import { useToast } from '../Toast/Toast';
import { formatUGX } from '../../utils/currency';
import { resolveImageUrl } from '../../api/client';
import './ProductCard.css';

// Local license-safe placeholder; used when a product has no image or it fails to load.
const PLACEHOLDER = '/img-placeholder.svg';

const ProductCard = ({ product }) => {
  const { addToCart, loading } = useCart();
  const { getLocalizedField, t } = useLanguage();
  const { showToast } = useToast();
  const [added, setAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const name = getLocalizedField(product, 'name') || product.name || 'Fresh Produce';
  // Backend formatLocalizedProduct exposes `price` (integer UGX); keep a safe fallback.
  const price = product.priceUgx ?? product.price ?? 0;
  const stock = product.availability?.stockQuantity ?? product.stockQuantity ?? 0;
  const inStock = product.availability?.inStock ?? stock > 0;
  const isAvailable = inStock && stock > 0;

  const primaryImage = product.image || (product.images && product.images[0]?.imageUrl) || product.imageUrl;
  const imageUrl = resolveImageUrl(primaryImage) || PLACEHOLDER;

  const handleAdd = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAvailable || isAdding) return;

    setIsAdding(true);
    const res = await addToCart({ ...product, priceUgx: price }, 1);
    setIsAdding(false);
    if (res?.success) {
      setAdded(true);
      showToast(`${name} added to cart`, { type: 'success' });
      setTimeout(() => setAdded(false), 1800);
    } else if (res?.error) {
      showToast(res.error, { type: 'error' });
    }
  };

  return (
    <div className={`um-prod-card ${!isAvailable ? 'um-prod-card--out' : ''}`}>
      <Link to={`/product/${product.id}`} className="um-prod-image-wrapper">
        <img
          src={imageFailed ? PLACEHOLDER : imageUrl}
          alt={name}
          className="um-prod-image"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
        {product.category && (
          <span className="um-prod-cat-badge">
            {getLocalizedField(product.category, 'name') || product.category.name}
          </span>
        )}
        {!isAvailable && (
          <div className="um-prod-out-overlay">
            <span>{t('outOfStock')}</span>
          </div>
        )}
      </Link>

      <div className="um-prod-body">
        <div className="um-prod-meta">
          <span className="um-prod-unit">
            {product.unit ? `${t('unit')}: ${product.unit}` : 'Per item'}
          </span>
          {isAvailable ? (
            <span className="um-prod-stock-badge in-stock">
              ● {t('inStock')}
            </span>
          ) : (
            <span className="um-prod-stock-badge out-stock">
              ● {t('outOfStock')}
            </span>
          )}
        </div>

        <Link to={`/product/${product.id}`} className="um-prod-title">
          {name}
        </Link>

        <div className="um-prod-footer">
          <div className="um-prod-price-box">
            <span className="um-prod-price">{formatUGX(price)}</span>
            {product.unit && <span className="um-prod-per">/{product.unit}</span>}
          </div>

          <button
            type="button"
            className={`btn btn-sm ${added ? 'btn-success' : 'btn-primary'} um-prod-add-btn`}
            onClick={handleAdd}
            disabled={!isAvailable || isAdding || loading}
          >
            {added ? '✓ Added' : isAdding ? 'Adding...' : `+ ${t('addToCart')}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
