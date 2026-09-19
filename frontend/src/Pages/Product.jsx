import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../api/client';
import ProductCard from '../Components/ProductCard/ProductCard';
import { useCart } from '../Context/CartContext';
import { useLanguage } from '../Context/LanguageContext';
import { formatUGX } from '../utils/currency';
import './Product.css';

const DEFAULT_IMAGE = '/img-placeholder.svg';

export const Product = () => {
  const { productId } = useParams();
  const { addToCart, loading: cartLoading } = useCart();
  const { currentLang, getLocalizedField, t } = useLanguage();

  const [product, setProduct] = useState(null);
  const [activeImage, setActiveImage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addedNotice, setAddedNotice] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const isNumeric = !isNaN(productId);
        const endpoint = isNumeric
          ? `/products/${productId}?lang=${currentLang}`
          : `/products/slug/${productId}?lang=${currentLang}`;

        const res = await apiClient.get(endpoint);
        if (isMounted && res?.data) {
          const prod = res.data;
          setProduct(prod);

          const primary = prod.images?.find((img) => img.isPrimary) || prod.images?.[0];
          setActiveImage(primary?.imageUrl || prod.imageUrl || DEFAULT_IMAGE);
          setQuantity(1);

          // Fetch related products in the same category
          if (prod.category?.slug) {
            try {
              const relRes = await apiClient.get(
                `/products?categorySlug=${prod.category.slug}&limit=4&lang=${currentLang}`
              );
              if (isMounted && relRes?.data) {
                setRelatedProducts(relRes.data.filter((p) => p.id !== prod.id).slice(0, 3));
              }
            } catch (e) {
              console.warn('Failed to load related products', e);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load product', err);
        if (isMounted) setError(err.message || 'Product not found');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProduct();
    window.scrollTo(0, 0);

    return () => {
      isMounted = false;
    };
  }, [productId, currentLang]);

  if (loading) {
    return (
      <div className="container um-prod-detail-loading">
        <div className="um-spinner" />
        <p>Loading product details...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="container um-prod-detail-error card">
        <h2>Produce Not Found</h2>
        <p>{error || 'The requested food product is not available.'}</p>
        <Link to="/catalog" className="btn btn-primary">
          Return to Food Catalog
        </Link>
      </div>
    );
  }

  const name = getLocalizedField(product, 'name') || product.name;
  const description = getLocalizedField(product, 'description') || product.description;
  const price = product.priceUgx ?? product.price ?? 0;
  const stock = product.availability?.stockQuantity ?? product.stockQuantity ?? 999;
  const inStock = product.availability?.inStock ?? (stock > 0);
  const isAvailable = (product.isActive !== false) && inStock && stock > 0;

  // NOTE: commitment deposit percentages are configured on the UgaMarket
  // server and may change; the authoritative split is shown at checkout.

  const handleAddToCart = async () => {
    if (!isAvailable || cartLoading) return;
    const cartItem = {
      ...product,
      priceUgx: price,
      stockQuantity: stock,
      image: activeImage,
      name
    };
    const res = await addToCart(cartItem, quantity);
    if (res?.success) {
      setAddedNotice(true);
      setTimeout(() => setAddedNotice(false), 2500);
    }
  };

  const incrementQty = () => {
    if (quantity < stock) setQuantity((q) => q + 1);
  };

  const decrementQty = () => {
    if (quantity > 1) setQuantity((q) => q - 1);
  };

  return (
    <div className="um-prod-detail-page">
      <div className="container">
        {/* Breadcrumbs */}
        <nav className="um-detail-breadcrumb">
          <Link to="/">Home</Link>
          <span>/</span>
          <Link to="/catalog">{t('catalog')}</Link>
          {product.category && (
            <>
              <span>/</span>
              <Link to={`/catalog?category=${product.category.slug}`}>
                {getLocalizedField(product.category, 'name') || product.category.name}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="um-breadcrumb-current">{name}</span>
        </nav>

        {/* Product Hero Grid */}
        <div className="um-detail-grid">
          {/* Gallery Column */}
          <div className="um-detail-gallery">
            <div className="um-detail-main-img-wrap card">
              <img
                src={activeImage}
                alt={name}
                className="um-detail-main-img"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = DEFAULT_IMAGE;
                }}
              />
              {!isAvailable && (
                <div className="um-detail-out-banner">
                  <span>{t('outOfStock')}</span>
                </div>
              )}
            </div>

            {/* Thumbnail selector if multiple images */}
            {product.images && product.images.length > 1 && (
              <div className="um-detail-thumbs">
                {product.images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    className={`um-detail-thumb-btn ${activeImage === img.imageUrl ? 'um-detail-thumb--active' : ''}`}
                    onClick={() => setActiveImage(img.imageUrl)}
                  >
                    <img src={img.imageUrl} alt={img.altText || name} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details Column */}
          <div className="um-detail-info">
            {product.category && (
              <span className="badge badge-success um-detail-cat-badge">
                {getLocalizedField(product.category, 'name') || product.category.name}
              </span>
            )}

            <h1 className="um-detail-title">{name}</h1>

            <div className="um-detail-meta-row">
              <div className="um-detail-stock">
                {isAvailable ? (
                  <span className="badge badge-success">
                    ● In Stock ({stock} {product.unit || 'units'} available)
                  </span>
                ) : (
                  <span className="badge badge-danger">
                    ● Out of Stock
                  </span>
                )}
              </div>
              {product.sku && <span className="um-detail-sku">SKU: {product.sku}</span>}
            </div>

            {/* Price Box */}
            <div className="um-detail-price-box">
              <div className="um-detail-price-main">
                <span className="um-detail-price">{formatUGX(price)}</span>
                {product.unit && <span className="um-detail-per">per {product.unit}</span>}
              </div>
              <p className="um-detail-vat-note">Prices shown in Ugandan Shillings (UGX)</p>
            </div>

            {/* Transparent Financial Structure Box */}
            <div className="um-financial-callout card">
              <div className="um-callout-header">
                <strong>UgaMarket Commitment Model</strong>
              </div>
              <div className="um-callout-grid">
                <div className="um-callout-item">
                  <span className="um-callout-label">Pay Now</span>
                  <span className="um-callout-val">Small commitment deposit</span>
                </div>
                <div className="um-callout-divider">+</div>
                <div className="um-callout-item">
                  <span className="um-callout-label">Pay at Fulfillment</span>
                  <span className="um-callout-val">Remaining balance</span>
                </div>
              </div>
              <p className="um-callout-hint">
                🛡️ You only pay the remaining balance after inspecting fresh food quality at your door or pickup station. Exact amounts are confirmed at checkout by the UgaMarket server.
              </p>
            </div>

            {/* Quantity Stepper & Actions */}
            <div className="um-detail-actions-box">
              <div className="um-qty-group">
                <span className="form-label">Quantity ({product.unit || 'items'}):</span>
                <div className="um-qty-stepper">
                  <button
                    type="button"
                    onClick={decrementQty}
                    disabled={quantity <= 1 || !isAvailable}
                    className="um-qty-btn"
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <span className="um-qty-value">{quantity}</span>
                  <button
                    type="button"
                    onClick={incrementQty}
                    disabled={quantity >= stock || !isAvailable}
                    className="um-qty-btn"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="um-detail-buttons">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!isAvailable || cartLoading}
                  className="btn btn-primary btn-lg um-detail-add-btn"
                >
                  🛒 {addedNotice ? 'Added to Cart!' : `Add ${quantity} to Cart`}
                </button>
                <Link to="/cart" className="btn btn-secondary btn-lg">
                  View Cart
                </Link>
              </div>

              {addedNotice && (
                <div className="alert alert-success">
                  ✓ Produce successfully added to your cart!{' '}
                  <Link to="/cart" style={{ textDecoration: 'underline', fontWeight: 600 }}>
                    Proceed to Cart →
                  </Link>
                </div>
              )}
            </div>

            {/* Description & Farm Notes */}
            <div className="um-detail-desc card">
              <h3>Produce Information</h3>
              <p>{description || 'Fresh agricultural produce sourced directly from local Ugandan farmers. Grown naturally with sustainable farm practices.'}</p>
              <div className="um-detail-features">
                <div>🛡️ <strong>Inspect First:</strong> Pay the balance only after checking your produce</div>
                <div>📍 <strong>Your Choice:</strong> Doorstep delivery or pickup station collection</div>
                <div>🌱 <strong>Farm Sourced:</strong> From verified Ugandan farmers</div>
              </div>
            </div>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="um-related-section">
            <h2 className="um-section-title">Similar Harvest Items</h2>
            <div className="um-products-grid">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Product;