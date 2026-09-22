import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Leaf, MapPin, Minus, Plus, ShieldCheck, ShoppingCart, Truck, Wallet } from 'lucide-react';
import apiClient, { resolveImageUrl } from '../api/client';
import ProductCard from '../Components/ProductCard/ProductCard';
import SlidingTabs from '../Components/ui/SlidingTabs';
import { useToast } from '../Components/Toast/Toast';
import { useCart } from '../Context/CartContext';
import { useLanguage } from '../Context/LanguageContext';
import { formatUGX } from '../utils/currency';
import { friendlyError } from '../utils/errors';
import './Product.css';

const DEFAULT_IMAGE = '/img-placeholder.svg';
const MAX_QTY = 999;

export const Product = () => {
  const { productId } = useParams();
  const { addToCart, loading: cartLoading } = useCart();
  const { currentLang, getLocalizedField, t } = useLanguage();
  const { showToast } = useToast();

  const [product, setProduct] = useState(null);
  const [activeImage, setActiveImage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(false);
  const [tab, setTab] = useState('description');
  const [zoom, setZoom] = useState(null);
  const addedTimer = useRef(null);

  useEffect(() => () => clearTimeout(addedTimer.current), []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const isNumeric = /^\d+$/.test(productId);
        const endpoint = isNumeric
          ? `/products/${productId}?lang=${currentLang}`
          : `/products/slug/${encodeURIComponent(productId)}?lang=${currentLang}`;
        const res = await apiClient.get(endpoint, { signal: controller.signal });
        if (!mounted || !res?.data) return;

        const prod = res.data;
        setProduct(prod);
        const primary = prod.images?.find((img) => img.isPrimary) || prod.images?.[0];
        setActiveImage(primary?.imageUrl || prod.imageUrl || '');
        setQuantity(1);
        setAdded(false);

        if (prod.category?.slug) {
          try {
            const rel = await apiClient.get(
              `/products?categorySlug=${encodeURIComponent(prod.category.slug)}&limit=5&lang=${currentLang}`,
              { signal: controller.signal }
            );
            if (mounted && Array.isArray(rel?.data)) setRelated(rel.data.filter((p) => p.id !== prod.id).slice(0, 4));
          } catch {
            /* related products are optional */
          }
        }
      } catch (err) {
        if (mounted && err?.name !== 'AbortError') setError(friendlyError(err, t, 'productNotFoundDesc'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
    // `t` changes only with the language, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, currentLang]);

  const tabOptions = useMemo(
    () => [
      { value: 'description', label: t('tabDescription'), id: 'pd-tab-description', controls: 'pd-panel-description' },
      { value: 'delivery', label: t('tabDelivery'), id: 'pd-tab-delivery', controls: 'pd-panel-delivery' }
    ],
    [t]
  );

  if (loading) {
    return (
      <div className="container pd-state" role="status">
        <div className="um-spinner" />
        <p>{t('loadingProduct')}</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="container pd-state">
        <div className="state-block panel">
          <h2>{t('productNotFoundTitle')}</h2>
          <p>{error || t('productNotFoundDesc')}</p>
          <Link to="/catalog" className="btn btn-primary">
            {t('returnToCatalog')}
          </Link>
        </div>
      </div>
    );
  }

  const name = getLocalizedField(product, 'name') || product.name;
  const description = getLocalizedField(product, 'description') || product.description;
  const price = product.priceUgx ?? product.price ?? 0;
  const stock = product.availability?.stockQuantity ?? product.stockQuantity ?? 0;
  const inStock = product.availability?.inStock ?? stock > 0;
  const isAvailable = product.isActive !== false && inStock && stock > 0;
  const unit = product.unit || t('unitFallback');
  const maxQty = Math.max(1, Math.min(stock || 1, MAX_QTY));
  const categoryName = product.category ? getLocalizedField(product.category, 'name') || product.category.name : '';
  const images = product.images?.length ? product.images : [];
  const mainSrc = resolveImageUrl(activeImage) || DEFAULT_IMAGE;

  const setQty = (value) => {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return setQuantity(1);
    setQuantity(Math.min(Math.max(n, 1), maxQty));
  };

  const handleAddToCart = async () => {
    if (!isAvailable || cartLoading) return;
    const res = await addToCart({ ...product, priceUgx: price, stockQuantity: stock, image: activeImage, name }, quantity);
    if (res?.success) {
      setAdded(true);
      showToast(t('addedToCartToast', { name }), { type: 'success' });
      clearTimeout(addedTimer.current);
      addedTimer.current = setTimeout(() => setAdded(false), 2400);
    } else if (res?.error) {
      showToast(res.error, { type: 'error' });
    }
  };

  const onZoomMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  };

  return (
    <div className="pd container">
      <nav className="breadcrumb" aria-label={t('breadcrumb')}>
        <Link to="/">{t('breadcrumbHome')}</Link>
        <span aria-hidden="true">/</span>
        <Link to="/catalog">{t('catalogTitle')}</Link>
        {product.category && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/catalog?category=${encodeURIComponent(product.category.slug)}`}>{categoryName}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page">{name}</span>
      </nav>

      <div className="pd__grid">
        {/* Gallery */}
        <div className="pd__gallery">
          <div
            className={`pd__stage panel ${zoom ? 'pd__stage--zoom' : ''}`}
            onMouseMove={onZoomMove}
            onMouseLeave={() => setZoom(null)}
          >
            <img
              key={mainSrc}
              src={mainSrc}
              alt={name}
              className="pd__img"
              style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = DEFAULT_IMAGE;
              }}
            />
            {!isAvailable && <span className="pd__soldout">{t('outOfStock')}</span>}
          </div>

          {images.length > 1 && (
            <ul className="pd__thumbs">
              {images.map((img, i) => (
                <li key={img.id}>
                  <button
                    type="button"
                    className={`pd__thumb ${activeImage === img.imageUrl ? 'pd__thumb--active' : ''}`}
                    onClick={() => setActiveImage(img.imageUrl)}
                    aria-label={t('imageOf', { n: i + 1, total: images.length })}
                    aria-pressed={activeImage === img.imageUrl}
                  >
                    <img src={resolveImageUrl(img.imageUrl) || DEFAULT_IMAGE} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Details */}
        <div className="pd__info">
          {categoryName && <span className="badge badge-success">{categoryName}</span>}
          <h1 className="pd__title">{name}</h1>

          <div className="pd__meta">
            {isAvailable ? (
              <span className="badge badge-success">
                <Check size={12} strokeWidth={3} aria-hidden="true" />
                {t('inStockQty', { stock, unit })}
              </span>
            ) : (
              <span className="badge badge-danger">{t('outOfStock')}</span>
            )}
            {product.sku && (
              <span className="pd__sku">
                {t('sku')}: {product.sku}
              </span>
            )}
          </div>

          <div className="pd__price-box">
            <span className="pd__price">{formatUGX(price)}</span>
            {product.unit && <span className="pd__per">{t('perUnit', { unit: product.unit })}</span>}
          </div>
          <p className="pd__note">{t('pricesInUgx')}</p>

          <section className="pd__model">
            <h2>{t('commitmentModel')}</h2>
            <div className="pd__model-grid">
              <div>
                <span>{t('payNow')}</span>
                <strong>{t('smallDeposit')}</strong>
              </div>
              <span className="pd__model-plus" aria-hidden="true">
                +
              </span>
              <div>
                <span>{t('payAtFulfillment')}</span>
                <strong>{t('remainingBalanceLabel')}</strong>
              </div>
            </div>
            <p>
              <ShieldCheck size={16} aria-hidden="true" /> {t('commitmentHint')}
            </p>
          </section>

          <div className="pd__buy">
            <div className="pd__qty">
              <span className="form-label" id="pd-qty-label">
                {t('quantity')} ({unit})
              </span>
              <div className="qty" role="group" aria-labelledby="pd-qty-label">
                <button type="button" className="qty__btn" onClick={() => setQty(quantity - 1)} disabled={quantity <= 1 || !isAvailable} aria-label={t('decreaseQty')}>
                  <Minus size={16} aria-hidden="true" />
                </button>
                <input
                  className="qty__input"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQty(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  disabled={!isAvailable}
                  aria-label={t('quantity')}
                />
                <button type="button" className="qty__btn" onClick={() => setQty(quantity + 1)} disabled={quantity >= maxQty || !isAvailable} aria-label={t('increaseQty')}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="pd__actions">
              <button type="button" onClick={handleAddToCart} disabled={!isAvailable || cartLoading} className={`btn btn-lg pd__add ${added ? 'pd__add--done' : 'btn-primary'}`}>
                {added ? <Check size={18} aria-hidden="true" /> : <ShoppingCart size={18} aria-hidden="true" />}
                {added ? t('addedToCart') : t('addNToCart', { qty: quantity })}
              </button>
              <Link to="/cart" className="btn btn-lg btn-secondary">
                {t('viewCart')}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Details tabs */}
      <section className="pd__tabs panel">
        <SlidingTabs options={tabOptions} value={tab} onChange={setTab} ariaLabel={t('produceInfo')} variant="line" />
        <div className="pd__panel" role="tabpanel" id={`pd-panel-${tab}`} aria-labelledby={`pd-tab-${tab}`} key={tab}>
          {tab === 'description' ? (
            <>
              <h2>{t('produceInfo')}</h2>
              <p className="pd__desc">{description || t('defaultDescription')}</p>
              <ul className="pd__features">
                <li>
                  <ShieldCheck size={20} aria-hidden="true" />
                  <span>
                    <strong>{t('featureInspect')}</strong>
                    {t('featureInspectDesc')}
                  </span>
                </li>
                <li>
                  <MapPin size={20} aria-hidden="true" />
                  <span>
                    <strong>{t('featureChoice')}</strong>
                    {t('featureChoiceDesc')}
                  </span>
                </li>
                <li>
                  <Leaf size={20} aria-hidden="true" />
                  <span>
                    <strong>{t('featureFarm')}</strong>
                    {t('featureFarmDesc')}
                  </span>
                </li>
              </ul>
            </>
          ) : (
            <ul className="pd__features pd__features--cols">
              <li>
                <Truck size={20} aria-hidden="true" />
                <span>
                  <strong>{t('deliveryHomeTitle')}</strong>
                  {t('deliveryHomeDesc')}
                </span>
              </li>
              <li>
                <MapPin size={20} aria-hidden="true" />
                <span>
                  <strong>{t('deliveryPickupTitle')}</strong>
                  {t('deliveryPickupDesc')}
                </span>
              </li>
              <li>
                <Wallet size={20} aria-hidden="true" />
                <span>
                  <strong>{t('deliveryPayTitle')}</strong>
                  {t('deliveryPayDesc')}
                </span>
              </li>
            </ul>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section className="pd__related">
          <h2 className="section-title">{t('relatedTitle')}</h2>
          <div className="um-products-grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Phone: sticky purchase bar above the bottom navigation */}
      <div className="pd__sticky">
        <div>
          <strong>{formatUGX(price)}</strong>
          {product.unit && <small>{t('perUnit', { unit: product.unit })}</small>}
        </div>
        <button type="button" onClick={handleAddToCart} disabled={!isAvailable || cartLoading} className={`btn ${added ? 'pd__add--done' : 'btn-primary'}`}>
          {added ? <Check size={17} aria-hidden="true" /> : <ShoppingCart size={17} aria-hidden="true" />}
          {added ? t('addedToCart') : t('addToCart')}
        </button>
      </div>
    </div>
  );
};

export default Product;
