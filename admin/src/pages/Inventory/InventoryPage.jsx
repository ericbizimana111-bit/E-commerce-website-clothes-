import { useCallback, useEffect, useState } from 'react';
import { History, PackageCheck, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import { formatUGX } from '../../utils/format';
import DataTable from '../../components/ui/DataTable';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import StockActionModal from './StockActionModal';
import StockHistoryModal from './StockHistoryModal';
import { TableSkeleton } from '../../components/ui/loaders';
import { EmptyState, ErrorState } from '../../components/ui/states';
import './InventoryPage.css';

/**
 * Inventory administration.
 * Verified contract:
 *  - GET  /api/admin/products?inStock=false|true (stock lives on product rows)
 *  - POST /api/admin/products/:id/inventory/restock { quantity, reason?, referenceId? }
 *  - POST /api/admin/products/:id/inventory/adjust { quantityChange, reason?, referenceId? }
 *  - GET  /api/admin/products/:id/inventory/history -> { data: [...], product, pagination }
 * No client-side arithmetic ever changes stock — every mutation is a backend
 * transaction with an inventory trail.
 */
export default function InventoryPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [stockFilter, setStockFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restockTarget, setRestockTarget] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (stockFilter) params.set('inStock', stockFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/admin/products?${params.toString()}`);
      setRows(Array.isArray(res?.items) ? res.items : []);
      setPagination(res?.pagination || null);
    } catch (err) {
      setError(err.message || 'Unable to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [page, stockFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const onStockActionDone = async (message) => {
    showToast(message, { type: 'success' });
    await load();
  };

  const columns = [
    {
      key: 'slug',
      header: 'Product',
      render: (row) => (
        <div>
          <span className="inventory-page__slug">{row.slug}</span>
          {row.unit && <div className="inventory-page__sub">unit: {row.unit}</div>}
        </div>
      ),
    },
    {
      key: 'stockQuantity',
      header: 'Current Stock',
      render: (row) =>
        row.stockQuantity <= 0 ? (
          <span className="badge badge--danger">Out of stock</span>
        ) : row.stockQuantity <= 10 ? (
          <span className="badge badge--warning">Low · {row.stockQuantity}</span>
        ) : (
          <span className="badge badge--success">{row.stockQuantity} available</span>
        ),
    },
    {
      key: 'priceUgx',
      header: 'Price',
      render: (row) => formatUGX(row.priceUgx),
    },
    {
      key: 'isActive',
      header: 'State',
      render: (row) =>
        row.isActive ? (
          <span className="badge badge--info">Active</span>
        ) : (
          <span className="badge badge--neutral">Inactive</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'inventory-page__actions-col',
      render: (row) => (
        <div className="inventory-page__row-actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setRestockTarget(row)}>
            <PackageCheck size={12} aria-hidden="true" />
            Restock
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAdjustTarget(row)}>
            <SlidersHorizontal size={12} aria-hidden="true" />
            Adjust
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHistoryTarget(row)}>
            <History size={12} aria-hidden="true" />
            History
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock levels and movements. Every change is a backend transaction with an audit trail."
        actions={
          <button type="button" className="btn btn--secondary btn--sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      <div className="toolbar">
        <form
          className="toolbar__search"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          <Search size={15} aria-hidden="true" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search products"
            aria-label="Search inventory"
          />
        </form>

        <select
          value={stockFilter}
          onChange={(e) => {
            setPage(1);
            setStockFilter(e.target.value);
          }}
          aria-label="Filter by stock state"
        >
          <option value="">All stock states</option>
          <option value="true">In stock</option>
          <option value="false">Out of stock</option>
        </select>
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
                title="No inventory records"
                message="Products will appear here once the catalog has items."
              />
            }
          />
          <Pagination pagination={pagination} onPageChange={setPage} />
        </>
      )}

      {restockTarget && (
        <StockActionModal
          mode="restock"
          product={restockTarget}
          onClose={() => setRestockTarget(null)}
          onDone={onStockActionDone}
        />
      )}
      {adjustTarget && (
        <StockActionModal
          mode="adjust"
          product={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onDone={onStockActionDone}
        />
      )}
      {historyTarget && (
        <StockHistoryModal product={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
    </div>
  );
}
