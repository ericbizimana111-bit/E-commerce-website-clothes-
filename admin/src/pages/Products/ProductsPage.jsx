import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package, Pencil, Plus, Power, RefreshCw, Search } from 'lucide-react';
import api from '../../services/api';
import { hasRole, CATALOG_ROLES, useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/feedback/Toast';
import { formatUGX } from '../../utils/format';
import DataTable from '../../components/ui/DataTable';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { TableSkeleton } from '../../components/ui/loaders';
import { EmptyState, ErrorState } from '../../components/ui/states';
import './ProductsPage.css';

export default function ProductsPage() {
  const { role } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parseInt(searchParams.get('page') || '1', 10);
  const search = searchParams.get('search') || '';
  const inStock = searchParams.get('inStock') || '';
  const categoryId = searchParams.get('category') || '';

  const [searchInput, setSearchInput] = useState(search);
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const canManage = hasRole(role, CATALOG_ROLES);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Category options for the filter (admin categories endpoint, first page).
  useEffect(() => {
    api
      .get('/admin/categories?page=1&limit=100')
      .then((res) => setCategories(Array.isArray(res?.items) ? res.items : []))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search.trim()) params.set('search', search.trim());
      if (inStock) params.set('inStock', inStock);
      if (categoryId) params.set('categoryId', categoryId);

      // GET /api/admin/products -> { success, items, pagination }
      const res = await api.get(`/admin/products?${params.toString()}`);
      setRows(Array.isArray(res?.items) ? res.items : []);
      setPagination(res?.pagination || null);
    } catch (err) {
      setError(err.message || 'Unable to load products.');
    } finally {
      setLoading(false);
    }
  }, [page, search, inStock, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateParams = (updates) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, val]) => {
      if (val) next.set(key, val);
      else next.delete(key);
    });
    if (!('page' in updates)) next.delete('page');
    setSearchParams(next);
  };

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggleBusy(true);
    try {
      // PATCH /api/admin/catalog/products/:id/active { isActive }
      await api.patch(`/admin/products/${toggleTarget.id}/active`, {
        isActive: !toggleTarget.isActive,
      });
      showToast(
        `Product "${toggleTarget.slug}" ${toggleTarget.isActive ? 'deactivated' : 'activated'}.`,
        { type: 'success' },
      );
      setToggleTarget(null);
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to change product status.', { type: 'error' });
    } finally {
      setToggleBusy(false);
    }
  };

  const columns = [
    {
      key: 'slug',
      header: 'Product',
      render: (row) => (
        <div>
          <span className="products-page__slug">{row.slug}</span>
          {row.sku && <div className="products-page__sub mono">SKU {row.sku}</div>}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => row.category?.slug || '—',
    },
    {
      key: 'priceUgx',
      header: 'Price',
      render: (row) => formatUGX(row.priceUgx),
    },
    {
      key: 'stockQuantity',
      header: 'Stock',
      render: (row) => (
        <span className={row.stockQuantity <= 0 ? 'products-page__stock-out' : ''}>
          {row.stockQuantity}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row) =>
        row.isActive ? (
          <span className="badge badge--success">Active</span>
        ) : (
          <span className="badge badge--neutral">Inactive</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'products-page__actions-col',
      render: (row) =>
        canManage && (
          <div className="products-page__row-actions">
            <Link to={`/products/${row.id}`} className="btn btn--secondary btn--sm">
              <Pencil size={12} aria-hidden="true" />
              Edit
            </Link>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setToggleTarget(row)}
              aria-label={row.isActive ? `Deactivate ${row.slug}` : `Activate ${row.slug}`}
            >
              <Power size={12} aria-hidden="true" />
              {row.isActive ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        ),
    },
  ];

  const filtered = [search, inStock, categoryId].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Products"
        description="Catalog management: pricing, stock, and multilingual content."
        actions={
          canManage && (
            <Link to="/products/new" className="btn btn--primary btn--sm">
              <Plus size={14} aria-hidden="true" />
              New Product
            </Link>
          )
        }
      />

      <div className="toolbar">
        <form
          className="toolbar__search"
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ search: searchInput.trim() });
          }}
        >
          <Search size={15} aria-hidden="true" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search slug, SKU, or translated name"
            aria-label="Search products"
          />
        </form>

        <select
          value={categoryId}
          onChange={(e) => updateParams({ category: e.target.value })}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.slug}
            </option>
          ))}
        </select>

        <select
          value={inStock}
          onChange={(e) => updateParams({ inStock: e.target.value })}
          aria-label="Filter by stock"
        >
          <option value="">Any stock state</option>
          <option value="true">In stock only</option>
          <option value="false">Out of stock only</option>
        </select>

        {filtered > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSearchParams({})}>
            Clear filters ({filtered})
          </button>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            isLoading={loading}
            skeleton={<TableSkeleton rows={8} columns={5} />}
            emptyState={
              <EmptyState
                title="No products found"
                message={
                  filtered
                    ? 'No products match the current filters.'
                    : 'The catalog is empty. Create the first product to get started.'
                }
                action={
                  filtered ? (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setSearchParams({})}
                    >
                      Clear filters
                    </button>
                  ) : canManage ? (
                    <Link to="/products/new" className="btn btn--primary btn--sm">
                      <Package size={13} aria-hidden="true" />
                      Create product
                    </Link>
                  ) : null
                }
              />
            }
          />
          <Pagination pagination={pagination} onPageChange={(p) => updateParams({ page: String(p) })} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        danger={Boolean(toggleTarget?.isActive)}
        title={toggleTarget?.isActive ? 'Deactivate product?' : 'Activate product?'}
        message={
          toggleTarget?.isActive
            ? `"${toggleTarget?.slug}" will be hidden from the customer storefront immediately. Existing orders are unaffected.`
            : `"${toggleTarget?.slug}" will become visible to customers again.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
        busy={toggleBusy}
        onConfirm={handleToggleActive}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}
