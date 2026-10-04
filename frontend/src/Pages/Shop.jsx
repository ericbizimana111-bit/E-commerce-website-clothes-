import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Headset,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Store,
  Truck,
  Wallet,
  Wrench
} from 'lucide-react';
import apiClient, { resolveImageUrl } from '../api/client';
import ProductCard from '../Components/ProductCard/ProductCard';
import { ProductGridSkeleton, CategoryGridSkeleton } from '../Components/Skeletons/Skeletons';
import SlidingTabs from '../Components/ui/SlidingTabs';
import Reveal from '../Components/ui/Reveal';
import { useAuth } from '../Context/AuthContext';
import { useLanguage } from '../Context/LanguageContext';
import useCategories from '../utils/useCategories';
import { iconFor } from '../utils/categoryIcons';
import { formatUGX } from '../utils/currency';
import './Shop.css';

const CAT_PLACEHOLDER = '/img-placeholder.svg';
const SLIDE_MS = 6500;

const SLIDES = [
  { key: 'mslide1', tone: 'green', to: '/catalog', Icon: ShoppingBag },
  { key: 'mslide2', tone: 'amber', to: '/services', Icon: Wrench },
  { key: 'mslide3', tone: 'ink', to: '/how-it-works', Icon: Smartphone }
];

const FEATURED_QUERIES = {
  featured: 'limit=8&featured=true',
  new: 'limit=8',
  stock: 'limit=8&inStock=true',
  budget: 'limit=8&maxPrice=20000&sort=price_asc'
};

/* ── Hero ────────────────────────────────────────────────── */
const Hero = () => {
  const { t, getLocalizedField } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const { categories } = useCategories();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, []);

  useEffect(() => {
    if (paused || reduceMotion.current) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [paused]);

  const go = (next) => setIndex((next + SLIDES.length) % SLIDES.length);
  const firstName = user?.fullName?.split(' ')[0] || t('customerFallback');

  return (
    <section className="container hero" aria-label={t('brandName')}>
      <h1 className="um-visually-hidden">
        {t('brandName')} — {t('brandTagline')}
      </h1>
      <nav className="hero__cats panel" aria-label={t('heroCategories')}>
        <h2 className="hero__cats-title">{t('heroCategories')}</h2>
        <ul>
          {categories.slice(0, 10).map((cat) => {
            const Icon = iconFor(cat.icon);
            return (
              <li key={cat.id}>
                <Link to={`/catalog?category=${encodeURIComponent(cat.slug)}`} className="hero__cat">
                  <Icon size={16} aria-hidden="true" className="hero__cat-icon" />
                  <span>{getLocalizedField(cat, 'name') || cat.name}</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
          <li>
            <Link to="/services" className="hero__cat hero__cat--services">
              <Wrench size={16} aria-hidden="true" className="hero__cat-icon" />
              <span>{t('homeServices')}</span>
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          </li>
        </ul>
        <Link to="/catalog" className="hero__cats-all">
          {t('viewAllProducts')} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </nav>

      <div
        className="hero__slider"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        role="region"
        aria-roledescription="carousel"
        aria-label={t('brandTagline')}
      >
        {SLIDES.map(({ key, tone, to, Icon }, i) => (
          <article
            key={key}
            className={`slide slide--${tone} ${i === index ? 'slide--active' : ''}`}
            aria-hidden={i !== index}
            role="group"
            aria-roledescription="slide"
          >
            <div className="slide__copy">
              <span className="slide__kicker">{t(`${key}Kicker`)}</span>
              <h2 className="slide__title">{t(`${key}Title`)}</h2>
              <p className="slide__desc">{t(`${key}Desc`)}</p>
              <Link to={to} className="btn btn-lg slide__cta" tabIndex={i === index ? 0 : -1}>
                {t(`${key}Cta`)} <ArrowRight size={18} aria-hidden="true" className="btn__nudge" />
              </Link>
            </div>
            <div className="slide__art" aria-hidden="true">
              <span className="slide__ring slide__ring--a" />
              <span className="slide__ring slide__ring--b" />
              <span className="slide__icon">
                <Icon size={84} strokeWidth={1.2} />
              </span>
            </div>
          </article>
        ))}

        <div className="hero__controls">
          <button type="button" className="hero__arrow" onClick={() => go(index - 1)} aria-label={t('slidePrev')}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <div className="hero__dots">
            {SLIDES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                className={`hero__dot ${i === index ? 'hero__dot--active' : ''}`}
                onClick={() => setIndex(i)}
                aria-label={t('slideGoTo', { n: i + 1 })}
                aria-current={i === index}
              />
            ))}
          </div>
          <button type="button" className="hero__arrow" onClick={() => go(index + 1)} aria-label={t('slideNext')}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <aside className="hero__side">
        <div className="panel hero__member">
          <span className="hero__member-avatar">
            <Store size={22} aria-hidden="true" />
          </span>
          <h2>{isAuthenticated ? t('welcomeBack', { name: firstName }) : t('welcomeTitle')}</h2>
          <p>{isAuthenticated ? t('welcomeBackDesc') : t('welcomeDesc')}</p>
          {isAuthenticated ? (
            <div className="hero__member-actions hero__member-actions--single">
              <Link to="/account/orders" className="btn btn-primary btn-sm">
                {t('trackOrders')}
              </Link>
              <Link to="/account/messages" className="btn btn-secondary btn-sm">
                {t('messages')}
              </Link>
            </div>
          ) : (
            <div className="hero__member-actions">
              <Link to="/login" className="btn btn-secondary btn-sm">
                {t('signIn')}
              </Link>
              <Link to="/login?signup=true" className="btn btn-primary btn-sm">
                {t('signup')}
              </Link>
            </div>
          )}
        </div>

        <div className="hero__tiles">
          <div className="panel hero__tile">
            <Smartphone size={20} aria-hidden="true" />
            <div>
              <strong>{t('tileMomoTitle')}</strong>
              <span>{t('tileMomoDesc')}</span>
            </div>
          </div>
          <div className="panel hero__tile">
            <Headset size={20} aria-hidden="true" />
            <div>
              <strong>{t('tileSupportTitle')}</strong>
              <span>{t('tileSupportDesc')}</span>
            </div>
          </div>
        </div>
      </aside>
    </section>
  );
};

/* ── Trust strip ─────────────────────────────────────────── */
const TrustStrip = () => {
  const { t } = useLanguage();
  const items = [
    { Icon: BadgeCheck, title: t('trustQualityTitle'), desc: t('trustQualityDesc') },
    { Icon: ShieldCheck, title: t('trustInspectTitle'), desc: t('trustInspectDesc') },
    { Icon: Wallet, title: t('trustPayTitle'), desc: t('trustMomoDesc') },
    { Icon: Truck, title: t('trustDeliveryTitle'), desc: t('trustDeliveryDesc') }
  ];
  return (
    <section className="container" aria-label={t('brandName')}>
      <ul className="trust panel">
        {items.map(({ Icon, title, desc }) => (
          <li key={title} className="trust__item">
            <span className="trust__icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{desc}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/* ── Main page ───────────────────────────────────────────── */
const Shop = () => {
  const { t, currentLang, getLocalizedField } = useLanguage();
  const { categories, loading: catsLoading } = useCategories();

  const [tab, setTab] = useState('featured');
  const [products, setProducts] = useState([]);
  const [featuredState, setFeaturedState] = useState('loading'); // loading | ready | error
  const [reloadKey, setReloadKey] = useState(0);
  const [services, setServices] = useState([]);
  const featuredCache = useRef({});

  // Featured tabs: fetched on demand, cached per tab + language.
  useEffect(() => {
    const cacheKey = `${tab}:${currentLang}`;
    if (featuredCache.current[cacheKey]) {
      setProducts(featuredCache.current[cacheKey]);
      setFeaturedState('ready');
      return undefined;
    }
    let alive = true;
    setFeaturedState('loading');
    apiClient
      .get(`/products?${FEATURED_QUERIES[tab]}&lang=${currentLang}`)
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        featuredCache.current[cacheKey] = list;
        setProducts(list);
        setFeaturedState('ready');
      })
      .catch(() => alive && setFeaturedState('error'));
    return () => {
      alive = false;
    };
  }, [tab, currentLang, reloadKey]);

  useEffect(() => {
    let mounted = true;
    apiClient
      .get(`/services?lang=${currentLang}`)
      .then((res) => {
        if (mounted && Array.isArray(res?.data?.services)) setServices(res.data.services);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [currentLang]);

  const tabOptions = useMemo(
    () => [
      { value: 'featured', label: t('tabFeatured') },
      { value: 'new', label: t('tabNew') },
      { value: 'stock', label: t('tabInStock') },
      { value: 'budget', label: t('tabBudget') }
    ],
    [t]
  );


  return (
    <div className="um-home">
      <Hero />
      <TrustStrip />

      {/* Categories */}
      <Reveal as="section" className="section container">
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('catsTitle')}</h2>
            <p className="section-desc">{t('catsDesc')}</p>
          </div>
          <Link to="/catalog" className="btn btn-secondary btn-sm">
            {t('viewAll')} <ArrowRight size={15} aria-hidden="true" className="btn__nudge" />
          </Link>
        </div>

        {catsLoading ? (
          <CategoryGridSkeleton count={6} />
        ) : categories.length === 0 ? (
          <div className="um-empty-state">{t('catsEmpty')}</div>
        ) : (
          <div className="cat-rail">
            {categories.map((cat) => {
              const name = getLocalizedField(cat, 'name') || cat.name;
              const image = resolveImageUrl(cat.imageUrl);
              const Icon = iconFor(cat.icon);
              return (
                <Link key={cat.id} to={`/catalog?category=${encodeURIComponent(cat.slug)}`} className="cat-tile">
                  <span className={`cat-tile__media ${image ? '' : 'cat-tile__media--icon'}`}>
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = CAT_PLACEHOLDER;
                        }}
                      />
                    ) : (
                      <Icon size={40} strokeWidth={1.5} aria-hidden="true" />
                    )}
                  </span>
                  <span className="cat-tile__name">{name}</span>
                  <span className="cat-tile__count">{t('productsCount', { count: cat.productCount ?? 0 })}</span>
                </Link>
              );
            })}
          </div>
        )}
      </Reveal>

      {/* Featured products */}
      <Reveal as="section" className="section container featured">
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('featuredTitle')}</h2>
            <p className="section-desc">{t('featuredDesc')}</p>
          </div>
          <SlidingTabs options={tabOptions} value={tab} onChange={setTab} ariaLabel={t('featuredTitle')} />
        </div>

        {featuredState === 'loading' ? (
          <ProductGridSkeleton count={8} />
        ) : featuredState === 'error' ? (
          <div className="state-block">
            <AlertCircle size={32} aria-hidden="true" />
            <p>{t('productsLoadError')}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
              {t('retry')}
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="um-empty-state">
            {tab === 'featured' ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTab('new')}>
                {t('tabNew')}
              </button>
            ) : (
              t('productsEmpty')
            )}
          </div>
        ) : (
          <div className="um-products-grid featured__grid" key={`${tab}:${currentLang}`}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        <div className="featured__more">
          <Link to="/catalog" className="btn btn-primary">
            {t('viewAllProducts')} <ArrowRight size={16} aria-hidden="true" className="btn__nudge" />
          </Link>
        </div>
      </Reveal>

      {/* How it works */}
      <Reveal as="section" className="how">
        <div className="container">
          <div className="section-head how__head">
            <div>
              <span className="section-kicker">{t('howKicker')}</span>
              <h2 className="section-title">{t('howItWorks')}</h2>
            </div>
            <Link to="/how-it-works" className="btn btn-secondary btn-sm">
              {t('howItWorksShort')}
              <ArrowRight size={15} aria-hidden="true" className="btn__nudge" />
            </Link>
          </div>
          <ol className="how__steps">
            {[
              { n: '01', Icon: ShoppingBasket, title: t('howStep1Title'), desc: t('howStep1Desc') },
              { n: '02', Icon: CreditCard, title: t('howStep2Title'), desc: t('howStep2Desc') },
              { n: '03', Icon: ShieldCheck, title: t('howStep3Title'), desc: t('howStep3Desc') }
            ].map(({ n, Icon, title, desc }) => (
              <li key={n} className="how__step">
                <span className="how__num">{n}</span>
                <span className="how__icon">
                  <Icon size={26} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </Reveal>

      {/* Home services */}
      {services.length > 0 && (
        <Reveal as="section" className="section container">
          <div className="home-svc">
            <div className="home-svc__intro">
              <span className="home-svc__kicker">
                <Wrench size={14} aria-hidden="true" /> {t('servicesKicker')}
              </span>
              <h2>{t('homeServicesTitle')}</h2>
              <p>{t('homeServicesDesc')}</p>
              <Link to="/services" className="btn btn-accent">
                {t('allServices')} <ArrowRight size={16} aria-hidden="true" className="btn__nudge" />
              </Link>
            </div>
            <ul className="home-svc__list">
              {services.slice(0, 6).map((s) => {
                const Icon = iconFor(s.icon);
                return (
                  <li key={s.id}>
                    <Link to={`/services/${s.slug}`} className="home-svc__card">
                      <span className="home-svc__icon">
                        <Icon size={22} aria-hidden="true" />
                      </span>
                      <span>
                        <strong>{s.name}</strong>
                        <small>
                          <Clock size={12} aria-hidden="true" /> {t('fromPrice', { amount: formatUGX(s.priceFromUgx) })}
                        </small>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </Reveal>
      )}

      {/* Closing call to action */}
      <Reveal as="section" className="container">
        <div className="cta">
          <div>
            <h2>{t('finalCtaTitle')}</h2>
            <p>{t('finalCtaDesc')}</p>
          </div>
          <div className="cta__actions">
            <Link to="/catalog" className="btn btn-lg cta__primary">
              <ShoppingBag size={18} aria-hidden="true" /> {t('startShopping')}
            </Link>
            <Link to="/services" className="btn btn-lg btn-outline-light">
              <Wrench size={18} aria-hidden="true" /> {t('bookHomeService')}
            </Link>
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default Shop;
