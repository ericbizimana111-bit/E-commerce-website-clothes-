import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import { resolveImageUrl } from '../api/client';
import ProductCard from '../Components/ProductCard/ProductCard';
import { useLanguage } from '../Context/LanguageContext';
import './Shop.css';

const HeroImage = '/hero-produce.svg';
const CatPlaceholder = '/img-placeholder.svg';

const Shop = () => {
  const { t, currentLang, getLocalizedField } = useLanguage();
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadHomeData = async () => {
      try {
        setLoading(true);
        setError(false);
        // GET /api/categories and GET /api/products return `data` (array);
        // GET /api/pickup-stations returns `data.stations` (see pickupStation.routes.js).
        const [catRes, prodRes, stationRes] = await Promise.allSettled([
          apiClient.get(`/categories?lang=${currentLang}`),
          apiClient.get(`/products?limit=8&lang=${currentLang}`),
          apiClient.get('/pickup-stations')
        ]);

        if (isMounted) {
          if (catRes.status === 'fulfilled' && Array.isArray(catRes.value?.data)) {
            setCategories(catRes.value.data);
          }
          if (prodRes.status === 'fulfilled' && Array.isArray(prodRes.value?.data)) {
            setFeaturedProducts(prodRes.value.data);
          }
          if (stationRes.status === 'fulfilled' && Array.isArray(stationRes.value?.data?.stations)) {
            setStations(stationRes.value.data.stations.slice(0, 4));
          }
          if (
            catRes.status === 'rejected' &&
            prodRes.status === 'rejected'
          ) {
            setError(true);
          }
        }
      } catch (err) {
        console.error('Failed to load homepage data', err);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadHomeData();
    return () => {
      isMounted = false;
    };
  }, [currentLang]);

  return (
    <div className="um-home">
      {/* Hero Section */}
      <section className="um-hero">
        <div className="um-hero-container">
          <div className="um-hero-content">
            <div className="um-hero-badge">
              <span className="um-badge-icon">🌿</span>
              <span>Farm Fresh Produce Direct to Your Door</span>
            </div>
            <h1 className="um-hero-title">
              Uganda’s Fresh Food Marketplace, <span className="um-highlight">home to home.</span>
            </h1>
            <p className="um-hero-description">
              Order fresh matooke, beans, local rice, fresh greens, and farm produce sourced straight from Ugandan farmers. Inspect your food on delivery and pay the balance only after quality check.
            </p>
            <div className="um-hero-actions">
              <Link to="/catalog" className="btn btn-primary btn-lg">
                🛒 {t('startShopping')}
              </Link>
              <Link to="/pickup-stations" className="btn btn-secondary btn-lg">
                📍 {t('pickupStation')}s
              </Link>
            </div>

            <div className="um-hero-perks">
              <div className="um-perk-item">
                <span className="um-perk-icon">⚡</span>
                <div>
                  <strong>Small Commitment Deposit</strong>
                  <span>Secure your harvest order early</span>
                </div>
              </div>
              <div className="um-perk-item">
                <span className="um-perk-icon">🛡️</span>
                <div>
                  <strong>Quality Guarantee</strong>
                  <span>Inspect before paying the balance</span>
                </div>
              </div>
              <div className="um-perk-item">
                <span className="um-perk-icon">🏡</span>
                <div>
                  <strong>Home or Pickup</strong>
                  <span>Convenient collection points</span>
                </div>
              </div>
            </div>
          </div>

          <div className="um-hero-image-pane">
            <div className="um-hero-image-card">
              <img
                src={HeroImage}
                alt="Fresh Ugandan farm produce"
                className="um-hero-img"
              />
              <div className="um-hero-floating-badge">
                <div className="um-floating-circle">UGX</div>
                <div>
                  <strong>Fresh Matooke Clusters</strong>
                  <span>Sourced directly from Ugandan farms</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="um-how-it-works">
        <div className="container">
          <div className="um-section-header">
            <span className="um-section-subtitle">Transparent & Fair Food Commerce</span>
            <h2 className="um-section-title">{t('howItWorks')}</h2>
            <p className="um-section-desc">
              We built UgaMarket so customers never have to worry about food quality or fake payments.
            </p>
          </div>

          <div className="um-steps-grid">
            <div className="um-step-card">
              <div className="um-step-number">01</div>
              <div className="um-step-icon">🧺</div>
              <h3>{t('howStep1Title')}</h3>
              <p>{t('howStep1Desc')}</p>
            </div>

            <div className="um-step-card um-step-card--highlight">
              <div className="um-step-number">02</div>
              <div className="um-step-icon">💳</div>
              <h3>{t('howStep2Title')}</h3>
              <p>{t('howStep2Desc')}</p>
              <span className="um-step-badge">Commitment Deposit</span>
            </div>

            <div className="um-step-card">
              <div className="um-step-number">03</div>
              <div className="um-step-icon">🚚</div>
              <h3>{t('howStep3Title')}</h3>
              <p>{t('howStep3Desc')}</p>
              <span className="um-step-badge">Balance on Fulfillment</span>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="um-categories-section">
        <div className="container">
          <div className="um-section-header">
            <span className="um-section-subtitle">Fresh From The Soil</span>
            <h2 className="um-section-title">Shop by Category</h2>
            <p className="um-section-desc">Explore nutritious staples, cereals, and garden produce</p>
          </div>

          {loading ? (
            <div className="um-loading-state">Loading categories...</div>
          ) : categories.length === 0 ? (
            <div className="um-empty-state">No categories available yet. Check back soon!</div>
          ) : (
            <div className="um-cat-grid">
              {categories.map((cat) => {
                const catName = getLocalizedField(cat, 'name') || cat.name;
                const image = resolveImageUrl(cat.imageUrl) || CatPlaceholder;
                return (
                  <Link
                    key={cat.id}
                    to={`/catalog?category=${cat.slug}`}
                    className="um-cat-card"
                  >
                    <div className="um-cat-img-wrapper">
                      <img
                        src={image}
                        alt={catName}
                        className="um-cat-img"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = CatPlaceholder;
                        }}
                      />
                    </div>
                    <div className="um-cat-info">
                      <h4 className="um-cat-name">{catName}</h4>
                      <span className="um-cat-count">
                        {cat.productCount ?? 0} {cat.productCount === 1 ? 'product' : 'products'}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Featured Harvest Produce */}
      <section className="um-featured-section">
        <div className="container">
          <div className="um-section-header-flex">
            <div>
              <span className="um-section-subtitle">Daily Picks</span>
              <h2 className="um-section-title">Featured Farm Harvests</h2>
            </div>
            <Link to="/catalog" className="btn btn-secondary">
              View All Products →
            </Link>
          </div>

          {loading ? (
            <div className="um-loading-state">Loading fresh harvest produce...</div>
          ) : error && featuredProducts.length === 0 ? (
            <div className="um-empty-state">
              Could not load products. Please check your connection and refresh.
            </div>
          ) : featuredProducts.length === 0 ? (
            <div className="um-empty-state">No products currently available.</div>
          ) : (
            <div className="um-products-grid">
              {featuredProducts.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Pickup Stations Banner */}
      {stations.length > 0 && (
        <section className="um-stations-banner">
          <div className="container">
            <div className="um-stations-box">
              <div className="um-stations-text">
                <span className="badge badge-warning">No Pickup Surcharge</span>
                <h2>Free Pickup at UgaMarket Stations</h2>
                <p>
                  Prefer collecting your fresh produce on your commute home? Select a convenient pickup station with secure storage.
                </p>
                <Link to="/pickup-stations" className="btn btn-accent">
                  Explore Pickup Stations
                </Link>
              </div>

              <div className="um-stations-cards">
                {stations.map((s) => (
                  <div key={s.id} className="um-station-preview-card">
                    <div className="um-station-pin">📍</div>
                    <div>
                      <strong>{s.name}</strong>
                      <p>{s.addressText || s.district}</p>
                      <span className="um-station-hours">🕒 {s.operatingHours || 'Contact station for hours'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Shop;
