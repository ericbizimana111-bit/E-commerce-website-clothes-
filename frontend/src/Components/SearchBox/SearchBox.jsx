import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, Loader2, Search, Tag, X } from 'lucide-react';
import apiClient, { resolveImageUrl } from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';
import useDebouncedValue from '../../utils/useDebouncedValue';
import { formatUGX } from '../../utils/currency';
import { LIMITS, sanitizeLine } from '../../utils/inputGuards';
import './SearchBox.css';

const PLACEHOLDER = '/img-placeholder.svg';
const RECENT_KEY = 'ugamarket_recent_searches';
const MAX_RECENT = 5;
const MIN_CHARS = 2;

const readRecent = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
};

const writeRecent = (list) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* non-fatal */
  }
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bold the part of `text` that matches the typed query. */
const Highlight = ({ text, query }) => {
  const q = query.trim();
  if (!q) return text;
  const parts = String(text).split(new RegExp(`(${escapeRegExp(q)})`, 'i'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <strong key={i} className="sb-hit">
        {part}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
};

/**
 * Live product search with suggestions.
 *  - Searches as you type (debounced) and ignores stale responses.
 *  - Suggests products and matching categories; remembers recent searches.
 *  - Full keyboard support (↑ ↓ Enter Esc) and combobox ARIA semantics.
 *  - Enter / the search button opens the catalog filtered by what was typed.
 */
const SearchBox = ({ variant = 'header', autoFocus = false, onDone, className = '' }) => {
  const { t, currentLang, getLocalizedField } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const listId = useId();

  const urlSearch = useMemo(() => {
    if (location.pathname !== '/catalog') return '';
    return new URLSearchParams(location.search).get('search') || '';
  }, [location.pathname, location.search]);

  const [query, setQuery] = useState(urlSearch);
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recent, setRecent] = useState(readRecent);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const allCategoriesRef = useRef({ lang: null, list: [] });
  const requestId = useRef(0);

  // Follow the URL when the catalog page changes its own search (e.g. Reset).
  if (urlSearch !== prevUrlSearch) {
    setPrevUrlSearch(urlSearch);
    setQuery(urlSearch);
  }

  const debounced = useDebouncedValue(query.trim(), 250);
  const canSuggest = debounced.length >= MIN_CHARS;

  // Categories are small; fetch once per language and match locally.
  const loadCategories = useCallback(async () => {
    if (allCategoriesRef.current.lang === currentLang) return allCategoriesRef.current.list;
    try {
      const res = await apiClient.get(`/categories?lang=${currentLang}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      allCategoriesRef.current = { lang: currentLang, list };
      return list;
    } catch {
      return [];
    }
  }, [currentLang]);

  useEffect(() => {
    if (!open || !canSuggest) return undefined;
    const controller = new AbortController();
    const id = ++requestId.current;
    setStatus('loading');

    (async () => {
      try {
        const [res, cats] = await Promise.all([
          apiClient.get(`/products?search=${encodeURIComponent(debounced)}&limit=6&lang=${currentLang}`, {
            signal: controller.signal
          }),
          loadCategories()
        ]);
        if (id !== requestId.current) return; // a newer keystroke superseded this one
        const needle = debounced.toLowerCase();
        setProducts(Array.isArray(res?.data) ? res.data : []);
        setCategories(
          cats
            .filter((c) => (getLocalizedField(c, 'name') || c.name || '').toLowerCase().includes(needle))
            .slice(0, 3)
        );
        setStatus('done');
        setActiveIndex(-1);
      } catch (err) {
        if (err?.name === 'AbortError' || id !== requestId.current) return;
        setStatus('error');
      }
    })();

    return () => controller.abort();
  }, [debounced, canSuggest, open, currentLang, loadCategories, getLocalizedField]);

  // Close when clicking or tabbing outside.
  useEffect(() => {
    const onPointer = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, []);

  const remember = (term) => {
    const clean = term.trim();
    if (clean.length < MIN_CHARS) return;
    const next = [clean, ...recent.filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
    setRecent(next);
    writeRecent(next);
  };

  const finish = () => {
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
    onDone?.();
  };

  const goSearch = (term) => {
    const clean = sanitizeLine(term, LIMITS.search).trim();
    if (!clean) return;
    remember(clean);
    setQuery(clean);
    navigate(`/catalog?search=${encodeURIComponent(clean)}`);
    finish();
  };

  const goProduct = (product) => {
    remember(debounced);
    navigate(`/product/${product.id}`);
    setQuery('');
    finish();
  };

  const goCategory = (cat) => {
    navigate(`/catalog?category=${encodeURIComponent(cat.slug)}`);
    setQuery('');
    finish();
  };

  // Flat, ordered list of selectable rows (drives keyboard navigation).
  const rows = useMemo(() => {
    if (!canSuggest) return recent.map((term) => ({ type: 'recent', term }));
    const list = [
      ...categories.map((cat) => ({ type: 'category', cat })),
      ...products.map((product) => ({ type: 'product', product }))
    ];
    if (status === 'done' && (products.length > 0 || categories.length > 0)) {
      list.push({ type: 'all', term: debounced });
    }
    return list;
  }, [canSuggest, recent, categories, products, status, debounced]);

  const activate = (row) => {
    if (row.type === 'recent') goSearch(row.term);
    else if (row.type === 'category') goCategory(row.cat);
    else if (row.type === 'product') goProduct(row.product);
    else goSearch(row.term);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (rows.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const down = e.key === 'ArrowDown';
      setActiveIndex((i) => (down ? (i + 1) % rows.length : i <= 0 ? rows.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && rows[activeIndex]) activate(rows[activeIndex]);
      else goSearch(query);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      } else if (query) {
        setQuery('');
      }
    }
  };

  const clearRecent = () => {
    setRecent([]);
    writeRecent([]);
  };

  const showPanel = open && (canSuggest || recent.length > 0);
  const optionId = (i) => `${listId}-opt-${i}`;
  let rowCursor = -1;

  return (
    <div ref={wrapRef} className={`sb sb--${variant} ${className}`}>
      <form
        className="sb__form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          goSearch(query);
        }}
      >
        <Search className="sb__icon" size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          className="sb__input"
          value={query}
          onChange={(e) => {
            setQuery(sanitizeLine(e.target.value, LIMITS.search));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck="false"
          enterKeyHint="search"
          maxLength={LIMITS.search}
          autoFocus={autoFocus}
        />
        {status === 'loading' && canSuggest && open && (
          <Loader2 className="sb__spin" size={16} aria-label={t('searchSearching')} />
        )}
        {query && (
          <button
            type="button"
            className="sb__clear"
            aria-label={t('searchClear')}
            onClick={() => {
              setQuery('');
              setProducts([]);
              setCategories([]);
              setStatus('idle');
              inputRef.current?.focus();
              if (location.pathname === '/catalog' && urlSearch) navigate('/catalog');
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
        <button type="submit" className="sb__submit">
          <Search size={17} aria-hidden="true" className="sb__submit-icon" />
          <span className="sb__submit-label">{t('searchButton')}</span>
        </button>
      </form>

      {showPanel && (
        <div className="sb__panel" id={listId} role="listbox" aria-label={t('searchLabel')}>
          {!canSuggest && recent.length > 0 && (
            <>
              <div className="sb__group">
                <span>{t('searchRecent')}</span>
                <button type="button" className="sb__group-action" onClick={clearRecent}>
                  {t('searchClearRecent')}
                </button>
              </div>
              {recent.map((term) => {
                rowCursor += 1;
                const i = rowCursor;
                return (
                  <button
                    key={term}
                    id={optionId(i)}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === i}
                    className={`sb__row ${activeIndex === i ? 'sb__row--active' : ''}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => goSearch(term)}
                  >
                    <Clock size={15} aria-hidden="true" className="sb__row-icon" />
                    <span className="sb__row-text">{term}</span>
                  </button>
                );
              })}
            </>
          )}

          {canSuggest && status === 'error' && <div className="sb__note">{t('errGeneric')}</div>}

          {canSuggest && status === 'loading' && products.length === 0 && categories.length === 0 && (
            <div className="sb__note" role="status">
              {t('searchSearching')}
            </div>
          )}

          {canSuggest && status === 'done' && products.length === 0 && categories.length === 0 && (
            <div className="sb__empty" role="status">
              <strong>{t('searchNoMatch', { q: debounced })}</strong>
              <span>{t('searchNoMatchHint')}</span>
            </div>
          )}

          {canSuggest && categories.length > 0 && (
            <>
              <div className="sb__group">
                <span>{t('searchCategories')}</span>
              </div>
              {categories.map((cat) => {
                rowCursor += 1;
                const i = rowCursor;
                const name = getLocalizedField(cat, 'name') || cat.name;
                return (
                  <button
                    key={`c-${cat.id}`}
                    id={optionId(i)}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === i}
                    className={`sb__row ${activeIndex === i ? 'sb__row--active' : ''}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => goCategory(cat)}
                  >
                    <Tag size={15} aria-hidden="true" className="sb__row-icon" />
                    <span className="sb__row-text">
                      <Highlight text={name} query={debounced} />
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {canSuggest && products.length > 0 && (
            <>
              <div className="sb__group">
                <span>{t('searchProducts')}</span>
              </div>
              {products.map((product) => {
                rowCursor += 1;
                const i = rowCursor;
                const name = getLocalizedField(product, 'name') || product.name;
                const img =
                  resolveImageUrl(product.image || product.images?.[0]?.imageUrl || product.imageUrl) || PLACEHOLDER;
                const price = product.priceUgx ?? product.price ?? 0;
                return (
                  <button
                    key={`p-${product.id}`}
                    id={optionId(i)}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === i}
                    className={`sb__row sb__row--product ${activeIndex === i ? 'sb__row--active' : ''}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => goProduct(product)}
                  >
                    <img
                      src={img}
                      alt=""
                      className="sb__thumb"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = PLACEHOLDER;
                      }}
                    />
                    <span className="sb__row-text">
                      <Highlight text={name} query={debounced} />
                      {product.category && (
                        <small>
                          {t('searchInCategory', {
                            category: getLocalizedField(product.category, 'name') || product.category.name
                          })}
                        </small>
                      )}
                    </span>
                    <span className="sb__price">{formatUGX(price)}</span>
                  </button>
                );
              })}
            </>
          )}

          {canSuggest && status === 'done' && (products.length > 0 || categories.length > 0) && (
            (() => {
              rowCursor += 1;
              const i = rowCursor;
              return (
                <button
                  id={optionId(i)}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === i}
                  className={`sb__row sb__row--all ${activeIndex === i ? 'sb__row--active' : ''}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => goSearch(debounced)}
                >
                  <Search size={15} aria-hidden="true" className="sb__row-icon" />
                  <span className="sb__row-text">{t('searchSeeAll', { q: debounced })}</span>
                </button>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBox;
