import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';
import ProductCard from '../Components/ProductCard/ProductCard';
import { ProductGridSkeleton } from '../Components/Skeletons/Skeletons';
import { useLanguage } from '../Context/LanguageContext';
import './ProductCatalog.css';

const ProductCatalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentLang, getLocalizedField, t } = useLanguage();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter states
  const search = searchParams.get('search') || '';
  const categoryParam = searchParams.get('category') || '';
  const inStockParam = searchParams.get('inStock') === 'true';
  const minPriceParam = searchParams.get('minPrice') || '';
  const maxPriceParam = searchParams.get('maxPrice') || '';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);

  const [searchInput, setSearchInput] = useState(search);
  const [minPriceInput, setMinPriceInput] = useState(minPriceParam);
  const [maxPriceInput, setMaxPriceInput] = useState(maxPriceParam);

  // Sync search input with URL when URL changes
  useEffect(() => {
    setSearchInput(search);
    setMinPriceInput(minPriceParam);
    setMaxPriceInput(maxPriceParam);
  }, [search, minPriceParam, maxPriceParam]);

  // Fetch categories once
  useEffect(() => {
    let isMounted = true;
    const fetchCategories = async () => {
      try {
        const res = await apiClient.get(`/categories?lang=${currentLang}`);
        if (isMounted && res?.data) {
          setCategories(res.data);
        }
      } catch (err) {
        console.error('Failed to load categories', err);
      }
    };
    fetchCategories();
    return () => {
      isMounted = false;
    };
  }, [currentLang]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('lang', currentLang);
      params.set('page', pageParam.toString());
      params.set('limit', '12');

      if (search.trim()) params.set('search', search.trim());
      if (categoryParam) params.set('categorySlug', categoryParam);
      if (inStockParam) params.set('inStock', 'true');
      if (minPriceParam) params.set('minPrice', minPriceParam);
      if (maxPriceParam) params.set('maxPrice', maxPriceParam);

      const res = await apiClient.get(`/products?${params.toString()}`);
      if (res?.data) {
        setProducts(res.data);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      }
    } catch (err) {
      console.error('Failed to fetch products', err);
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [currentLang, search, categoryParam, inStockParam, minPriceParam, maxPriceParam, pageParam]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Filter setters
  const updateFilter = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === undefined || val === '') {
        newParams.delete(key);
      } else {
        newParams.set(key, val);
      }
    });
    // Reset to page 1 on filter changes unless page is explicitly changed
    if (!('page' in updates)) {
      newParams.delete('page');
    }
    setSearchParams(newParams);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    updateFilter({ search: searchInput.trim() });
  };

  const handlePriceApply = (e) => {
    e.preventDefault();
    updateFilter({
      minPrice: minPriceInput ? Math.max(0, parseInt(minPriceInput, 10)) : '',
      maxPrice: maxPriceInput ? Math.max(0, parseInt(maxPriceInput, 10)) : ''
    });
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setSearchParams({});
  };

  return (
    <div className="um-catalog-page">
      <div className="container">
        {/* Breadcrumb & Header */}
        <div className="um-catalog-header">
          <div>
            <h1 className="um-catalog-title">{t('catalog')}</h1>
            <p className="um-catalog-subtitle">
              Browse authentic farm harvests direct from Ugandan soils
            </p>
          </div>
          <div className="um-catalog-count">
            {pagination.total} {pagination.total === 1 ? 'item found' : 'items found'}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="um-filter-container card">
          <div className="um-filter-row">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="um-filter-search">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="form-input"
              />
              <button type="submit" className="btn btn-primary btn-sm">
                🔍 {t('filter')}
              </button>
            </form>

            {/* In-Stock Toggle */}
            <label className="um-instock-toggle">
              <input
                type="checkbox"
                checked={inStockParam}
                onChange={(e) => updateFilter({ inStock: e.target.checked ? 'true' : '' })}
              />
              <span>{t('inStockOnly')}</span>
            </label>

            {/* Price Filter Form */}
            <form onSubmit={handlePriceApply} className="um-filter-price-form">
              <input
                type="number"
                placeholder="Min UGX"
                value={minPriceInput}
                onChange={(e) => setMinPriceInput(e.target.value)}
                className="form-input um-price-input"
                min="0"
              />
              <span>-</span>
              <input
                type="number"
                placeholder="Max UGX"
                value={maxPriceInput}
                onChange={(e) => setMaxPriceInput(e.target.value)}
                className="form-input um-price-input"
                min="0"
              />
              <button type="submit" className="btn btn-secondary btn-sm">
                Go
              </button>
            </form>

            {/* Clear Filters */}
            {(search || categoryParam || inStockParam || minPriceParam || maxPriceParam) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="btn btn-sm btn-secondary um-reset-btn"
              >
                ✕ {t('reset')}
              </button>
            )}
          </div>

          {/* Category Pills */}
          <div className="um-category-pills">
            <button
              type="button"
              className={`um-pill ${!categoryParam ? 'um-pill--active' : ''}`}
              onClick={() => updateFilter({ category: '' })}
            >
              {t('allCategories')}
            </button>
            {categories.map((cat) => {
              const catName = getLocalizedField(cat, 'name') || cat.name;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`um-pill ${categoryParam === cat.slug ? 'um-pill--active' : ''}`}
                  onClick={() => updateFilter({ category: cat.slug })}
                >
                  {catName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <ProductGridSkeleton count={12} />
        ) : error ? (
          <div className="alert alert-error">
            <span>⚠️ {error}</span>
            <button onClick={fetchProducts} className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }}>
              Retry
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="um-no-products card">
            <span className="um-no-products-icon">🧺</span>
            <h3>No products found matching your criteria</h3>
            <p>Try clearing your search or adjusting your price filters.</p>
            <button onClick={handleResetFilters} className="btn btn-primary">
              View All Products
            </button>
          </div>
        ) : (
          <>
            <div className="um-products-grid">
              {products.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="um-pagination">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={pageParam <= 1}
                  onClick={() => updateFilter({ page: (pageParam - 1).toString() })}
                >
                  ← Previous
                </button>

                <div className="um-page-numbers">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      className={`um-page-btn ${p === pageParam ? 'um-page-btn--active' : ''}`}
                      onClick={() => updateFilter({ page: p.toString() })}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <button
                  className="btn btn-secondary btn-sm"
                  disabled={pageParam >= pagination.totalPages}
                  onClick={() => updateFilter({ page: (pageParam + 1).toString() })}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProductCatalog;
