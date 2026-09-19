import { useCallback, useEffect, useState } from 'react';
import { Boxes, Pencil, Plus, Power, RefreshCw, Search } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import DataTable from '../../components/ui/DataTable';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { TableSkeleton } from '../../components/ui/loaders';
import { EmptyState, ErrorState } from '../../components/ui/states';
import CategoryFormModal from './CategoryFormModal';
import './CategoriesPage.css';

/**
 * Category administration (ADMIN/SUPER_ADMIN only — sidebar hides this for
 * dispatchers; backend RBAC enforces the same rule).
 * Verified contract: GET/POST /api/admin/categories, PUT /api/admin/categories/:id,
 * PATCH /api/admin/categories/:id/active.
 */
export default function CategoriesPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editor, setEditor] = useState(null); // null | {} (create) | category (edit)
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/admin/categories?${params.toString()}`);
      setRows(Array.isArray(res?.items) ? res.items : []);
      setPagination(res?.pagination || null);
    } catch (err) {
      setError(err.message || 'Unable to load categories.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggleBusy(true);
    try {
      await api.patch(`/admin/categories/${toggleTarget.id}/active`, {
        isActive: !toggleTarget.isActive,
      });
      showToast(
        `Category "${toggleTarget.slug}" ${toggleTarget.isActive ? 'deactivated' : 'activated'}.`,
        { type: 'success' },
      );
      setToggleTarget(null);
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to change category status.', { type: 'error' });
    } finally {
      setToggleBusy(false);
    }
  };

  const columns = [
    {
      key: 'slug',
      header: 'Category',
      render: (row) => <span className="categories-page__slug">{row.slug}</span>,
    },
    {
      key: 'names',
      header: 'Names (en / lg)',
      render: (row) => {
        const en = row.translations?.find((t) => t.language === 'EN')?.name;
        const lg = row.translations?.find((t) => t.language === 'LG')?.name;
        return (
          <span>
            {en || '—'}
            <span className="categories-page__alt">{lg || '—'}</span>
          </span>
        );
      },
    },
    { key: 'productCount', header: 'Products', render: (row) => row._count?.products ?? 0 },
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
      className: 'categories-page__actions-col',
      render: (row) => (
        <div className="categories-page__row-actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setEditor(row)}
          >
            <Pencil size={12} aria-hidden="true" />
            Edit
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setToggleTarget(row)}
          >
            <Power size={12} aria-hidden="true" />
            {row.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Multilingual storefront categories."
        actions={
          <>
            <button type="button" className="btn btn--secondary btn--sm" onClick={load} disabled={loading}>
              <RefreshCw size={13} aria-hidden="true" />
              Refresh
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditor({})}>
              <Plus size={14} aria-hidden="true" />
              New Category
            </button>
          </>
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
            placeholder="Search categories"
            aria-label="Search categories"
          />
        </form>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            isLoading={loading}
            skeleton={<TableSkeleton rows={6} columns={5} />}
            emptyState={
              <EmptyState
                title="No categories"
                message="Create the first storefront category."
                action={
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditor({})}>
                    <Boxes size={13} aria-hidden="true" />
                    Create category
                  </button>
                }
              />
            }
          />
          <Pagination pagination={pagination} onPageChange={setPage} />
        </>
      )}

      {editor && (
        <CategoryFormModal
          category={editor.id ? editor : null}
          onClose={() => setEditor(null)}
          onSaved={async (message) => {
            setEditor(null);
            showToast(message, { type: 'success' });
            await load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        danger={Boolean(toggleTarget?.isActive)}
        title={toggleTarget?.isActive ? 'Deactivate category?' : 'Activate category?'}
        message={
          toggleTarget?.isActive
            ? `"${toggleTarget?.slug}" will be hidden from the storefront. Products keep their data.`
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
