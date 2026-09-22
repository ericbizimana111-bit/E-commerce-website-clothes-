import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import { useCart } from '../../Context/CartContext';
import { useLanguage } from '../../Context/LanguageContext';
import { useToast } from '../Toast/Toast';
import { formatUGX } from '../../utils/currency';
import { resolveImageUrl } from '../../api/client';
import './ProductCard.css';

const PLACEHOLDER = '/img-placeholder.svg';

const ProductCard = ({ product }) => {
  const { addToCart, loading } = useCart();
  const { getLocalizedField, t } = useLanguage();
  const { showToast } = useToast();
  const [added, setAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const resetTimer = useRef(null);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const name = getLocalizedField(product, 'name') || product.name || t('freshProduce');
  const price = product.priceUgx ?? product.price ?? 0;
  const stock = product.availability?.stockQuantity ?? product.stockQuantity ?? 0;
  const inStock = product.availability?.inStock ?? stock > 0;
  const isAvailable = inStock && stock > 0;
  const lowStock = isAvailable && stock <= 5;

  const primaryImage = product.image || (product.images && product.images[0]?.imageUrl) || product.imageUrl;
  const imageUrl = resolveImageUrl(primaryImage) || PLACEHOLDER;
  const categoryName = product.category ? getLocalizedField(product.category, 'name') || product.category.name : '';

  const handleAdd = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAvailable || isAdding) return;

    setIsAdding(true);
    const res = await addToCart({ ...product, priceUgx: price }, 1);
    setIsAdding(false);
    if (res?.success) {
      setAdded(true);
      showToast(t('addedToCartToast', { name }), { type: 'success' });
      resetTimer.current = setTimeout(() => setAdded(false), 1800);
    } else if (res?.error) {
      showToast(res.error, { type: 'error' });
    }
  };

  return (
    <article className={`pc ${!isAvailable ? 'pc--out' : ''}`}>
      <Link to={`/product/${product.id}`} className="pc__media" tabIndex={-1}>
        <img
          src={imageFailed ? PLACEHOLDER : imageUrl}
          alt={name}
          className="pc__img"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
        {categoryName && <span className="pc__cat">{categoryName}</span>}
        {!isAvailable && (
          <span className="pc__overlay">
            <span>{t('outOfStock')}</span>
          </span>
        )}
      </Link>

      <div className="pc__body">
        <Link to={`/product/${product.id}`} className="pc__title">
          {name}
        </Link>

        <div className="pc__price-row">
          <span className="pc__price">{formatUGX(price)}</span>
          {product.unit && <span className="pc__unit">{t('perUnit', { unit: product.unit })}</span>}
        </div>

        <div className="pc__meta">
          {isAvailable ? (
            <span className={`pc__stock ${lowStock ? 'pc__stock--low' : 'pc__stock--ok'}`}>
              <span className="pc__dot" aria-hidden="true" />
              {t('inStock')}
            </span>
          ) : (
            <span className="pc__stock pc__stock--out">
              <span className="pc__dot" aria-hidden="true" />
              {t('outOfStock')}
            </span>
          )}
        </div>

        <button
          type="button"
          className={`btn btn-sm pc__add ${added ? 'pc__add--done' : 'btn-primary'}`}
          onClick={handleAdd}
          disabled={!isAvailable || isAdding || loading}
        >
          {added ? (
            <>
              <Check size={15} strokeWidth={2.5} aria-hidden="true" /> {t('added')}
            </>
          ) : isAdding ? (
            t('adding')
          ) : (
            <>
              <Plus size={15} strokeWidth={2.5} aria-hidden="true" /> {t('addToCart')}
            </>
          )}
        </button>
      </div>
    </article>
  );
};

export default ProductCard;
