import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import { resolveImageUrl } from '../api/client';
import ProductCard from '../Components/ProductCard/ProductCard';
import { ProductGridSkeleton, CategoryGridSkeleton } from '../Components/Skeletons/Skeletons';
import { useLanguage } from '../Context/LanguageContext';
import {
  Leaf, Zap, ShieldCheck, Home, ShoppingBasket, CreditCard,
  Truck, MapPin, Clock, ShoppingCart, AlertCircle, Package,
} from 'lucide-react';
import './Shop.css';

const CatPlaceholder = '/img-placeholder.svg';

const HERO_ITEMS = [
  { icon: Leaf,          name: 'Matooke Clusters',  unit: 'per bunch',  price: 'UGX 12,000' },
  { icon: Package,       name: 'Local Rice (5 kg)',  unit: 'per bag',    price: 'UGX 18,500' },
  { icon: Zap,           name: 'Sukuma Wiki Bundle', unit: 'per bundle', price: 'UGX 4,000'  },
  { icon: ShoppingBasket,name: 'Mixed Beans (2 kg)', unit: 'per pack',   price: 'UGX 9,000'  },
];

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
          if (catRes.status === 'rejected' && prodRes.status === 'rejected') {
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
    return () => { isMounted = false; };
  }, [currentLang]);

  return (
    <div className="um-home">
      {/* Hero Section */}
      <section className="um-hero">
        <div className="um-hero-container">
          <div className="um-hero-content">
            <div className="um-hero-badge">
              <Leaf size={14} strokeWidth={2} />
              <span>Farm Fresh Produce Direct to Your Door</span>
            </div>
            <h1 className="um-hero-title">
              Uganda's Fresh Food Marketplace, <span className="um-highlight">home to home.</span>
            </h1>
            <p className="um-hero-description">
              Order fresh matooke, beans, local rice, fresh greens, and farm produce sourced straight from Ugandan farmers. Inspect your food on delivery and pay the balance only after quality check.
            </p>
            <div className="um-hero-actions">
              <Link to="/catalog" className="btn btn-primary btn-lg">
                <ShoppingCart size={18} strokeWidth={1.75} />
                {t('startShopping')}
              </Link>
              <Link to="/pickup-stations" className="btn btn-secondary btn-lg">
                <MapPin size={18} strokeWidth={1.75} />
                {t('pickupStation')}s
              </Link>
            </div>

            <div className="um-hero-perks">
              <div className="um-perk-item">
                <div className="um-perk-icon">
                  <Zap size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <strong>Small Commitment Deposit</strong>
                  <span>Secure your harvest order early</span>
                </div>
              </div>
              <div className="um-perk-item">
                <div className="um-perk-icon">
                  <ShieldCheck size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <strong>Quality Guarantee</strong>
                  <span>Inspect before paying the balance</span>
                </div>
              </div>
              <div className="um-perk-item">
                <div className="um-perk-icon">
                  <Home size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <strong>Home or Pickup</strong>
                  <span>Convenient collection points</span>
                </div>
              </div>
            </div>
          </div>

          <div className="um-hero-visual-pane">
            <div className="um-hero-visual-card">
              <div className="um-hvc-header">
                <div className="um-hvc-status">
                  <span className="um-hvc-dot" />
                  Live Harvest Market
                </div>
                <span className="um-hvc-badge">Open Now</span>
              </div>
              <div className="um-hvc-items">
                {HERO_ITEMS.map((item) => (
                  <div key={item.name} className="um-hvc-row">
                    <span className="um-hvc-icon"><item.icon size={16} strokeWidth={1.75} /></span>
                    <div className="um-hvc-info">
                      <strong>{item.name}</strong>
                      <span>{item.unit}</span>
                    </div>
                    <span className="um-hvc-price">{item.price}</span>
                  </div>
                ))}
              </div>
              <div className="um-hvc-footer">
                <div className="um-hvc-stat"><strong>500+</strong><span>Farms</span></div>
                <div className="um-hvc-divider" />
                <div className="um-hvc-stat"><strong>30%</strong><span>Deposit</span></div>
                <div className="um-hvc-divider" />
                <div className="um-hvc-stat"><strong>MTN/Airtel</strong><span>Mobile Pay</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="um-how-it-works">
        <div className="container">
          <div className="um-section-header">
            <span className="um-section-subtitle">Transparent &amp; Fair Food Commerce</span>
            <h2 className="um-section-title">{t('howItWorks')}</h2>
            <p className="um-section-desc">
              We built UgaMarket so customers never have to worry about food quality or fake payments.
            </p>
          </div>

          <div className="um-steps-grid">
            <div className="um-step-card">
              <div className="um-step-number">01</div>
              <div className="um-step-icon">
                <ShoppingBasket size={28} strokeWidth={1.5} />
              </div>
              <h3>{t('howStep1Title')}</h3>
              <p>{t('howStep1Desc')}</p>
            </div>

            <div className="um-step-card um-step-card--highlight">
              <div className="um-step-number">02</div>
              <div className="um-step-icon um-step-icon--accent">
                <CreditCard size={28} strokeWidth={1.5} />
              </div>
              <h3>{t('howStep2Title')}</h3>
              <p>{t('howStep2Desc')}</p>
              <span className="um-step-badge">Commitment Deposit</span>
            </div>

            <div className="um-step-card">
              <div className="um-step-number">03</div>
              <div className="um-step-icon">
                <Truck size={28} strokeWidth={1.5} />
              </div>
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
            <CategoryGridSkeleton count={6} />
          ) : categories.length === 0 ? (
            <div className="um-empty-state">No categories available yet. Check back soon!</div>
          ) : (
            <div className="um-cat-grid">
              {categories.map((cat) => {
                const catName = getLocalizedField(cat, 'name') || cat.name;
                const image = resolveImageUrl(cat.imageUrl) || CatPlaceholder;
                return (
                  <Link key={cat.id} to={`/catalog?category=${cat.slug}`} className="um-cat-card">
                    <div className="um-cat-img-wrapper">
                      <img
                        src={image}
                        alt={catName}
                        className="um-cat-img"
                        onError={(e) => { e.target.onerror = null; e.target.src = CatPlaceholder; }}
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
              View All Products &rarr;
            </Link>
          </div>

          {loading ? (
            <ProductGridSkeleton count={8} />
          ) : error && featuredProducts.length === 0 ? (
            <div className="um-empty-state">
              <AlertCircle size={32} strokeWidth={1.5} style={{ margin: '0 auto 0.75rem' }} />
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
                <span className="badge badge-warning">No Delivery Fee</span>
                <h2>Pick Up Your Order at a UgaMarket Station</h2>
                <p>
                  Prefer collecting your fresh produce yourself? Choose a convenient pickup station and pay no delivery fee.
                </p>
                <Link to="/pickup-stations" className="btn btn-accent">
                  Explore Pickup Stations
                </Link>
              </div>

              <div className="um-stations-cards">
                {stations.map((s) => (
                  <div key={s.id} className="um-station-preview-card">
                    <div className="um-station-pin">
                      <MapPin size={18} strokeWidth={1.75} />
                    </div>
                    <div>
                      <strong>{s.name}</strong>
                      <p>{s.addressText || s.district}</p>
                      <span className="um-station-hours">
                        <Clock size={12} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                        {s.operatingHours || 'Contact station for hours'}
                      </span>
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
