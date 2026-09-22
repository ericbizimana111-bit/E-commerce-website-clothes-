import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Search, ShoppingBasket, SlidersHorizontal, X } from 'lucide-react';
import apiClient from '../api/client';
import ProductCard from '../Components/ProductCard/ProductCard';
import Pagination from '../Components/ui/Pagination';
import { ProductGridSkeleton } from '../Components/Skeletons/Skeletons';
import { useLanguage } from '../Context/LanguageContext';
import useCategories from '../utils/useCategories';
import useDebouncedValue from '../utils/useDebouncedValue';
import { LIMITS, sanitizeLine } from '../utils/inputGuards';
import { friendlyError } from '../utils/errors';
import './ProductCatalog.css';

const PAGE_SIZE = 12;
const PRICE_PRESETS = [
  { key: 'priceUnder10', min: '', max: '10000' },
  { key: 'price10to30', min: '10000', max: '30000' },
  { key: 'priceOver30', min: '30000', max: '' }
];

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 9);

/** Filter controls, shared by the desktop sidebar and the phone bottom sheet. */
const FilterPanel = ({ categories, categoryParam, inStock, minPrice, maxPrice, onChange, onPreset, t, getLocalizedField }) => {
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
              <span>{t('allCategories')}</span>
            </button>
          </li>
          {categories.map((cat) => (
            <li key={cat.id}>
              <button
                type="button"
                className={`filters__cat ${categoryParam === cat.slug ? 'filters__cat--active' : ''}`}
                aria-pressed={categoryParam === cat.slug}
                onClick={() => onChange({ category: cat.slug })}
              >
                <span>{getLocalizedField(cat, 'name') || cat.name}</span>
                <small>{cat.productCount ?? 0}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>

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
      </section>
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
  const pageParam = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

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
  }, [currentLang, search, categoryParam, inStockParam, minPriceParam, maxPriceParam, pageParam, reloadKey]);

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
    if (inStockParam) chips.push({ key: 'inStock', label: t('inStockOnly'), clear: { inStock: '' } });
    if (minPriceParam || maxPriceParam) {
      const label = `UGX ${minPriceParam ? Number(minPriceParam).toLocaleString('en-UG') : '0'} – ${
        maxPriceParam ? Number(maxPriceParam).toLocaleString('en-UG') : '∞'
      }`;
      chips.push({ key: 'price', label, clear: { minPrice: '', maxPrice: '' } });
    }
    return chips;
  }, [search, categoryParam, activeCategory, inStockParam, minPriceParam, maxPriceParam, t, getLocalizedField]);

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
          <h1 className="page-title">{search.trim() ? t('resultsFor', { q: search.trim() }) : t('catalogTitle')}</h1>
          <p className="section-desc">{t('catalogSubtitle')}</p>
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
