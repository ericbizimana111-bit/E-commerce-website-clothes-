import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, LayoutGrid, Search, ShoppingBasket, SlidersHorizontal, Wrench, X } from 'lucide-react';
import apiClient from '../api/client';
import ProductCard from '../Components/ProductCard/ProductCard';
import Pagination from '../Components/ui/Pagination';
import { ProductGridSkeleton } from '../Components/Skeletons/Skeletons';
import { useLanguage } from '../Context/LanguageContext';
import useCategories from '../utils/useCategories';
import { iconFor } from '../utils/categoryIcons';
import useDebouncedValue from '../utils/useDebouncedValue';
import { LIMITS, sanitizeLine } from '../utils/inputGuards';
import { friendlyError } from '../utils/errors';
import './ProductCatalog.css';

const PAGE_SIZE = 12;
const PRICE_PRESETS = [
  { key: 'priceUnder20k', min: '', max: '20000' },
  { key: 'price20to100k', min: '20000', max: '100000' },
  { key: 'price100to500k', min: '100000', max: '500000' },
  { key: 'priceOver500k', min: '500000', max: '' }
];
const SORTS = ['newest', 'price_asc', 'price_desc', 'name'];

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 9);

/** Filter controls, shared by the desktop sidebar and the phone bottom sheet. */
const FilterPanel = ({ categories, categoryParam, inStock, featured, brand, brands, minPrice, maxPrice, onChange, onPreset, t, getLocalizedField }) => {
  const [minInput, setMinInput] = useState(minPrice);
  const [maxInput, setMaxInput] = useState(maxPrice);
  const [prevMin, setPrevMin] = useState(minPrice);
  const [prevMax, setPrevMax] = useState(maxPrice);

  // Follow URL changes (presets, reset) without an effect.
  if (minPrice !== prevMin) {
    setPrevMin(minPrice);
    setMinInput(minPrice);
  }
  if (maxPrice !== prevMax) {
    setPrevMax(maxPrice);
    setMaxInput(maxPrice);
  }

  const debouncedMin = useDebouncedValue(minInput, 600);
  const debouncedMax = useDebouncedValue(maxInput, 600);

  // Apply typed prices automatically once the customer pauses.
  useEffect(() => {
    if (debouncedMin !== minPrice || debouncedMax !== maxPrice) {
      const lo = debouncedMin && debouncedMax && Number(debouncedMin) > Number(debouncedMax) ? debouncedMax : debouncedMin;
      const hi = debouncedMin && debouncedMax && Number(debouncedMin) > Number(debouncedMax) ? debouncedMin : debouncedMax;
      onChange({ minPrice: lo, maxPrice: hi });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedMin, debouncedMax]);

  return (
    <div className="filters">
      <section className="filters__group">
        <h3>{t('filterCategory')}</h3>
        <ul className="filters__cats">
          <li>
            <button
              type="button"
              className={`filters__cat ${!categoryParam ? 'filters__cat--active' : ''}`}
              aria-pressed={!categoryParam}
              onClick={() => onChange({ category: '' })}
            >
              <LayoutGrid size={16} aria-hidden="true" className="filters__cat-icon" />
              <span>{t('allCategories')}</span>
            </button>
          </li>
          {categories.map((cat) => {
            const Icon = iconFor(cat.icon);
            return (
              <li key={cat.id}>
                <button
                  type="button"
                  className={`filters__cat ${categoryParam === cat.slug ? 'filters__cat--active' : ''}`}
                  aria-pressed={categoryParam === cat.slug}
                  onClick={() => onChange({ category: cat.slug, brand: '' })}
                >
                  <Icon size={16} aria-hidden="true" className="filters__cat-icon" />
                  <span>{getLocalizedField(cat, 'name') || cat.name}</span>
                  <small>{cat.productCount ?? 0}</small>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {brands.length > 0 && (
        <section className="filters__group">
          <h3>{t('filterBrand')}</h3>
          <ul className="filters__brands">
            {brands.map((b) => (
              <li key={b.name}>
                <label className="check-row">
                  <input type="checkbox" checked={brand.toLowerCase() === b.name.toLowerCase()} onChange={(e) => onChange({ brand: e.target.checked ? b.name : '' })} />
                  <span>{b.name}</span>
                  <small>{b.count}</small>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="filters__group">
        <h3>{t('filterPrice')}</h3>
        <div className="filters__price">
          <input
            type="text"
            inputMode="numeric"
            className="form-input"
            placeholder={t('minPrice')}
            aria-label={`${t('filterPrice')} — ${t('minPrice')}`}
            value={minInput}
            onChange={(e) => setMinInput(digitsOnly(e.target.value))}
            maxLength={9}
          />
          <span aria-hidden="true">–</span>
          <input
            type="text"
            inputMode="numeric"
            className="form-input"
            placeholder={t('maxPrice')}
            aria-label={`${t('filterPrice')} — ${t('maxPrice')}`}
            value={maxInput}
            onChange={(e) => setMaxInput(digitsOnly(e.target.value))}
            maxLength={9}
          />
        </div>
        <div className="filters__chips">
          {PRICE_PRESETS.map((preset) => {
            const active = preset.min === minPrice && preset.max === maxPrice;
            return (
              <button
                key={preset.key}
                type="button"
                className={`chip ${active ? 'chip--active' : ''}`}
                aria-pressed={active}
                onClick={() => onPreset(active ? { minPrice: '', maxPrice: '' } : { minPrice: preset.min, maxPrice: preset.max })}
              >
                {t(preset.key)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="filters__group">
        <h3>{t('filterAvailability')}</h3>
        <label className="switch">
          <input type="checkbox" checked={inStock} onChange={(e) => onChange({ inStock: e.target.checked ? 'true' : '' })} />
          <span className="switch__track" aria-hidden="true" />
          <span>{t('inStockOnly')}</span>
        </label>
        <label className="switch" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={featured} onChange={(e) => onChange({ featured: e.target.checked ? 'true' : '' })} />
          <span className="switch__track" aria-hidden="true" />
          <span>{t('featuredOnly')}</span>
        </label>
      </section>

      <Link to="/services" className="filters__promo">
        <Wrench size={20} aria-hidden="true" />
        <span>
          <strong>{t('promoServicesTitle')}</strong>
          <small>{t('promoServicesDesc')}</small>
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
};

const ProductCatalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentLang, getLocalizedField, t } = useLanguage();
  const { categories } = useCategories();

  const search = searchParams.get('search') || '';
  const categoryParam = searchParams.get('category') || '';
  const inStockParam = searchParams.get('inStock') === 'true';
  const minPriceParam = searchParams.get('minPrice') || '';
  const maxPriceParam = searchParams.get('maxPrice') || '';
  const brandParam = searchParams.get('brand') || '';
  const featuredParam = searchParams.get('featured') === 'true';
  const sortParam = SORTS.includes(searchParams.get('sort')) ? searchParams.get('sort') : 'newest';
  const pageParam = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [brands, setBrands] = useState([]);

  // Brand facets for the current category.
  useEffect(() => {
    let alive = true;
    apiClient
      .get(`/products/facets${categoryParam ? `?categorySlug=${encodeURIComponent(categoryParam)}` : ''}`)
      .then((res) => alive && setBrands(res?.data?.brands || []))
      .catch(() => alive && setBrands([]));
    return () => {
      alive = false;
    };
  }, [categoryParam]);

  const [searchInput, setSearchInput] = useState(search);
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setSearchInput(search);
  }

  const updateFilter = useCallback(
    (updates) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(updates).forEach(([key, val]) => {
            if (val === null || val === undefined || val === '') next.delete(key);
            else next.set(key, val);
          });
          if (!('page' in updates)) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Live search: update the URL shortly after the customer stops typing.
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350);
  useEffect(() => {
    if (debouncedSearch !== search.trim()) updateFilter({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Fetch products; the previous request is cancelled when filters change.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ lang: currentLang, page: String(pageParam), limit: String(PAGE_SIZE) });
    if (search.trim()) params.set('search', search.trim());
    if (categoryParam) params.set('categorySlug', categoryParam);
    if (inStockParam) params.set('inStock', 'true');
    if (minPriceParam) params.set('minPrice', minPriceParam);
    if (maxPriceParam) params.set('maxPrice', maxPriceParam);
    if (brandParam) params.set('brand', brandParam);
    if (featuredParam) params.set('featured', 'true');
    if (sortParam !== 'newest') params.set('sort', sortParam);

    apiClient
      .get(`/products?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        setProducts(Array.isArray(res?.data) ? res.data : []);
        if (res?.pagination) setPagination(res.pagination);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setError(friendlyError(err, t, 'loadMoreError'));
        setLoading(false);
      });

    return () => controller.abort();
    // `t` is stable per language; including currentLang covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLang, search, categoryParam, inStockParam, minPriceParam, maxPriceParam, brandParam, featuredParam, sortParam, pageParam, reloadKey]);

  // Lock scroll behind the phone filter sheet.
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);

  const activeCategory = categories.find((c) => c.slug === categoryParam);

  const activeChips = useMemo(() => {
    const chips = [];
    if (search.trim()) chips.push({ key: 'search', label: `“${search.trim()}”`, clear: { search: '' } });
    if (categoryParam) {
      chips.push({
        key: 'category',
        label: activeCategory ? getLocalizedField(activeCategory, 'name') || activeCategory.name : categoryParam,
        clear: { category: '' }
      });
    }
    if (brandParam) chips.push({ key: 'brand', label: brandParam, clear: { brand: '' } });
    if (inStockParam) chips.push({ key: 'inStock', label: t('inStockOnly'), clear: { inStock: '' } });
    if (featuredParam) chips.push({ key: 'featured', label: t('featuredOnly'), clear: { featured: '' } });
    if (minPriceParam || maxPriceParam) {
      const label = `UGX ${minPriceParam ? Number(minPriceParam).toLocaleString('en-UG') : '0'} – ${
        maxPriceParam ? Number(maxPriceParam).toLocaleString('en-UG') : '∞'
      }`;
      chips.push({ key: 'price', label, clear: { minPrice: '', maxPrice: '' } });
    }
    return chips;
  }, [search, categoryParam, activeCategory, brandParam, inStockParam, featuredParam, minPriceParam, maxPriceParam, t, getLocalizedField]);

  const resetAll = () => {
    setSearchInput('');
    setSearchParams({}, { replace: true });
  };

  const goToPage = (page) => {
    updateFilter({ page: String(page) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filterPanel = (
    <FilterPanel
      categories={categories}
      categoryParam={categoryParam}
      inStock={inStockParam}
      featured={featuredParam}
      brand={brandParam}
      brands={brands}
      minPrice={minPriceParam}
      maxPrice={maxPriceParam}
      onChange={updateFilter}
      onPreset={updateFilter}
      t={t}
      getLocalizedField={getLocalizedField}
    />
  );

  return (
    <div className="catalog container">
      <nav className="breadcrumb" aria-label={t('breadcrumb')}>
        <Link to="/">{t('breadcrumbHome')}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{activeCategory ? getLocalizedField(activeCategory, 'name') || activeCategory.name : t('catalogTitle')}</span>
      </nav>

      <header className="catalog__head">
        <div>
          <h1 className="page-title catalog__title">
            {activeCategory && !search.trim() && (() => {
              const Icon = iconFor(activeCategory.icon);
              return (
                <span className="catalog__title-icon">
                  <Icon size={22} aria-hidden="true" />
                </span>
              );
            })()}
            {search.trim()
              ? t('resultsFor', { q: search.trim() })
              : activeCategory
              ? getLocalizedField(activeCategory, 'name') || activeCategory.name
              : t('catalogTitle')}
          </h1>
          <p className="section-desc">{t('catalogSubtitleAll')}</p>
        </div>
        <p className="catalog__count" role="status" aria-live="polite">
          {!loading && !error ? t('resultsCount', { count: pagination.total }) : ' '}
        </p>
      </header>

      <div className="catalog__layout">
        <aside className="catalog__sidebar panel" aria-label={t('filters')}>
          {filterPanel}
        </aside>

        <div className="catalog__main">
          <div className="catalog__bar panel">
            <div className="catalog__search">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                className="catalog__search-input"
                value={searchInput}
                onChange={(e) => setSearchInput(sanitizeLine(e.target.value, LIMITS.search))}
                placeholder={t('catalogSearchPlaceholder')}
                aria-label={t('searchLabel')}
                maxLength={LIMITS.search}
                autoComplete="off"
                spellCheck="false"
                enterKeyHint="search"
              />
              {searchInput && (
                <button type="button" className="catalog__search-clear" onClick={() => setSearchInput('')} aria-label={t('searchClear')}>
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
            <label className="catalog__sort">
              <span className="um-visually-hidden">{t('sortBy')}</span>
              <select className="form-select" value={sortParam} onChange={(e) => updateFilter({ sort: e.target.value === 'newest' ? '' : e.target.value })} aria-label={t('sortBy')}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`sort_${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-secondary catalog__filter-btn" onClick={() => setSheetOpen(true)}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              {t('filters')}
              {activeChips.length > 0 && <span className="catalog__filter-count">{activeChips.length}</span>}
            </button>
          </div>

          {activeChips.length > 0 && (
            <div className="catalog__chips" aria-label={t('activeFilters')}>
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="chip chip--removable"
                  onClick={() => {
                    if (chip.key === 'search') setSearchInput('');
                    updateFilter(chip.clear);
                  }}
                  aria-label={`${t('removeFilter')}: ${chip.label}`}
                >
                  {chip.label} <X size={13} aria-hidden="true" />
                </button>
              ))}
              <button type="button" className="catalog__reset" onClick={resetAll}>
                {t('reset')}
              </button>
            </div>
          )}

          {loading ? (
            <ProductGridSkeleton count={PAGE_SIZE} />
          ) : error ? (
            <div className="alert alert-error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }}>
                {t('retry')}
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="state-block panel">
              <span className="state-block__icon">
                <ShoppingBasket size={34} strokeWidth={1.4} aria-hidden="true" />
              </span>
              <h3>{t('noResultsTitle')}</h3>
              <p>{t('noResultsDesc')}</p>
              <button type="button" onClick={resetAll} className="btn btn-primary">
                {t('viewAllProducts')}
              </button>
            </div>
          ) : (
            <>
              <div className="um-products-grid catalog__grid" key={`${search}|${categoryParam}|${pageParam}`}>
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <Pagination page={pageParam} totalPages={pagination.totalPages} onChange={goToPage} />
            </>
          )}
        </div>
      </div>

      {/* Phone filter sheet */}
      <div className={`sheet-backdrop ${sheetOpen ? 'sheet-backdrop--open' : ''}`} onClick={() => setSheetOpen(false)} aria-hidden="true" />
      <div className={`sheet ${sheetOpen ? 'sheet--open' : ''}`} role="dialog" aria-modal="true" aria-label={t('filters')} aria-hidden={!sheetOpen} inert={!sheetOpen}>
        <div className="sheet__head">
          <h2>{t('filters')}</h2>
          <button type="button" className="um-icon-btn" onClick={() => setSheetOpen(false)} aria-label={t('close')}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="sheet__body">{sheetOpen && filterPanel}</div>
        <div className="sheet__foot">
          <button type="button" className="btn btn-secondary" onClick={resetAll}>
            {t('reset')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setSheetOpen(false)}>
            {t('showResults')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCatalog;
