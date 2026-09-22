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
  Home as HomeIcon,
  Leaf,
  MapPin,
  Navigation,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  Truck,
  Wallet
} from 'lucide-react';
import apiClient, { resolveImageUrl } from '../api/client';
import ProductCard from '../Components/ProductCard/ProductCard';
import { ProductGridSkeleton, CategoryGridSkeleton } from '../Components/Skeletons/Skeletons';
import SlidingTabs from '../Components/ui/SlidingTabs';
import Reveal from '../Components/ui/Reveal';
import { useAuth } from '../Context/AuthContext';
import { useLanguage } from '../Context/LanguageContext';
import useCategories from '../utils/useCategories';
import { isOpenNow, mapsUrl } from '../utils/stations';
import './Shop.css';

const CAT_PLACEHOLDER = '/img-placeholder.svg';
const SLIDE_MS = 6500;

const SLIDES = [
  { key: 'slide1', tone: 'green', to: '/catalog', Icon: Sprout },
  { key: 'slide2', tone: 'amber', to: '/pickup-stations', Icon: MapPin },
  { key: 'slide3', tone: 'ink', to: '/how-it-works', Icon: ShieldCheck }
];

const FEATURED_QUERIES = {
  new: 'limit=8',
  stock: 'limit=8&inStock=true',
  budget: 'limit=8&maxPrice=10000'
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
          {categories.slice(0, 8).map((cat) => (
            <li key={cat.id}>
              <Link to={`/catalog?category=${encodeURIComponent(cat.slug)}`} className="hero__cat">
                <span>{getLocalizedField(cat, 'name') || cat.name}</span>
                <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </li>
          ))}
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
            <Leaf size={22} aria-hidden="true" />
          </span>
          <h2>{isAuthenticated ? t('welcomeBack', { name: firstName }) : t('welcomeTitle')}</h2>
          <p>{isAuthenticated ? t('welcomeBackDesc') : t('welcomeDesc')}</p>
          {isAuthenticated ? (
            <div className="hero__member-actions hero__member-actions--single">
              <Link to="/account/orders" className="btn btn-primary btn-sm">
                {t('trackOrders')}
              </Link>
              <Link to="/account/addresses" className="btn btn-secondary btn-sm">
                {t('savedAddresses')}
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
            <CreditCard size={20} aria-hidden="true" />
            <div>
              <strong>{t('sideTilePayTitle')}</strong>
              <span>{t('sideTilePayDesc')}</span>
            </div>
          </div>
          <div className="panel hero__tile">
            <BadgeCheck size={20} aria-hidden="true" />
            <div>
              <strong>{t('sideTileFarmTitle')}</strong>
              <span>{t('sideTileFarmDesc')}</span>
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
    { Icon: Leaf, title: t('trustFarmTitle'), desc: t('trustFarmDesc') },
    { Icon: ShieldCheck, title: t('trustInspectTitle'), desc: t('trustInspectDesc') },
    { Icon: Wallet, title: t('trustPayTitle'), desc: t('trustPayDesc') },
    { Icon: Truck, title: t('trustPickupTitle'), desc: t('trustPickupDesc') }
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

  const [tab, setTab] = useState('new');
  const [products, setProducts] = useState([]);
  const [featuredState, setFeaturedState] = useState('loading'); // loading | ready | error
  const [reloadKey, setReloadKey] = useState(0);
  const [stations, setStations] = useState([]);
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
      .get('/pickup-stations')
      .then((res) => {
        if (mounted && Array.isArray(res?.data?.stations)) setStations(res.data.stations);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const tabOptions = useMemo(
    () => [
      { value: 'new', label: t('tabNew') },
      { value: 'stock', label: t('tabInStock') },
      { value: 'budget', label: t('tabBudget') }
    ],
    [t]
  );

  const openCount = stations.filter((s) => isOpenNow(s.operatingHours) === true).length;
  const anyHours = stations.some((s) => isOpenNow(s.operatingHours) !== null);

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
              const image = resolveImageUrl(cat.imageUrl) || CAT_PLACEHOLDER;
              return (
                <Link key={cat.id} to={`/catalog?category=${encodeURIComponent(cat.slug)}`} className="cat-tile">
                  <span className="cat-tile__media">
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = CAT_PLACEHOLDER;
                      }}
                    />
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
          <div className="um-empty-state">{t('productsEmpty')}</div>
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

      {/* Pickup stations */}
      {stations.length > 0 && (
        <Reveal as="section" className="section container">
          <div className="pickup">
            <div className="pickup__intro">
              <span className="pickup__kicker">
                <Truck size={14} aria-hidden="true" /> {t('stationsKicker')}
              </span>
              <h2>{t('stationsHomeTitle')}</h2>
              <p>{t('stationsHomeDesc')}</p>

              <dl className="pickup__stats">
                <div>
                  <dt>{t('stationsStatCount')}</dt>
                  <dd>{stations.length}</dd>
                </div>
                {anyHours && (
                  <div>
                    <dt>{t('stationsStatOpen')}</dt>
                    <dd>{openCount}</dd>
                  </div>
                )}
              </dl>

              <Link to="/pickup-stations" className="btn btn-accent">
                {t('stationsExplore')} <ArrowRight size={16} aria-hidden="true" className="btn__nudge" />
              </Link>
            </div>

            <ul className="pickup__list">
              {stations.slice(0, 4).map((station) => {
                const open = isOpenNow(station.operatingHours);
                return (
                  <li key={station.id} className="pickup__card">
                    <span className="pickup__pin">
                      <MapPin size={20} aria-hidden="true" />
                    </span>
                    <div className="pickup__info">
                      <div className="pickup__title">
                        <strong>{station.name}</strong>
                        {open !== null && (
                          <span className={`badge ${open ? 'badge-success' : 'badge-neutral'}`}>
                            {open ? t('openNow') : t('closedNow')}
                          </span>
                        )}
                      </div>
                      <p>{station.addressText || station.district}</p>
                      <span className="pickup__hours">
                        <Clock size={13} aria-hidden="true" /> {station.operatingHours || t('contactForHours')}
                      </span>
                    </div>
                    <a
                      href={mapsUrl(station)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pickup__go"
                      aria-label={`${t('getDirections')}: ${station.name}`}
                    >
                      <Navigation size={17} aria-hidden="true" />
                    </a>
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
              <HomeIcon size={18} aria-hidden="true" /> {t('startShopping')}
            </Link>
            <Link to="/pickup-stations" className="btn btn-lg btn-outline-light">
              <MapPin size={18} aria-hidden="true" /> {t('pickupStations')}
            </Link>
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default Shop;
