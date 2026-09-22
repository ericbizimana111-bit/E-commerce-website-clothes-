import { useCallback, useEffect, useState } from 'react';
import { MapPin, Pencil, Plus, Power, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import DataTable from '../../components/ui/DataTable';
import PageHeader from '../../components/ui/PageHeader';
import SearchInput from '../../components/ui/SearchInput';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { TableSkeleton } from '../../components/ui/loaders';
import { EmptyState, ErrorState } from '../../components/ui/states';
import StationFormModal from './StationFormModal';
import './StationsPage.css';

/**
 * Pickup station administration (ADMIN/SUPER_ADMIN only — the sidebar hides
 * this for dispatchers and the backend enforces the same rule).
 * Contract: GET/POST /api/admin/pickup-stations, PUT /api/admin/pickup-stations/:id,
 * PATCH /api/admin/pickup-stations/:id/active. Stations are never deleted
 * (orders reference them); deactivating hides one from customers.
 */
export default function StationsPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editor, setEditor] = useState(null); // null | {} (create) | station (edit)
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/admin/pickup-stations?${params.toString()}`);
      setRows(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      setError(err.message || 'Unable to load pickup stations.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggleBusy(true);
    try {
      await api.patch(`/admin/pickup-stations/${toggleTarget.id}/active`, { isActive: !toggleTarget.isActive });
      showToast(`"${toggleTarget.name}" ${toggleTarget.isActive ? 'deactivated' : 'activated'}.`, { type: 'success' });
      setToggleTarget(null);
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to change station status.', { type: 'error' });
    } finally {
      setToggleBusy(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Station',
      render: (row) => (
        <span>
          <span className="stations-page__name">{row.name}</span>
          <span className="stations-page__sub">{row.district}</span>
        </span>
      ),
    },
    { key: 'addressText', header: 'Address', render: (row) => <span className="stations-page__address">{row.addressText}</span> },
    { key: 'operatingHours', header: 'Opening hours' },
    { key: 'contactPhone', header: 'Phone' },
    { key: 'orderCount', header: 'Orders' },
    {
      key: 'isActive',
      header: 'Status',
      render: (row) =>
        row.isActive ? <span className="badge badge--success">Active</span> : <span className="badge badge--neutral">Inactive</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'stations-page__actions-col',
      render: (row) => (
        <div className="stations-page__row-actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditor(row)}>
            <Pencil size={12} aria-hidden="true" />
            Edit
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setToggleTarget(row)}>
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
        title="Pickup Stations"
        description="Where customers collect their orders. Inactive stations are hidden from the storefront."
        actions={
          <>
            <button type="button" className="btn btn--secondary btn--sm" onClick={load} disabled={loading}>
              <RefreshCw size={13} aria-hidden="true" />
              Refresh
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditor({})}>
              <Plus size={14} aria-hidden="true" />
              New Station
            </button>
          </>
        }
      />

      <div className="toolbar">
        <SearchInput value={search} onSearch={setSearch} placeholder="Search name, district or address" label="Search stations" />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          isLoading={loading}
          skeleton={<TableSkeleton rows={5} columns={7} />}
          emptyState={
            <EmptyState
              title={search ? 'No stations match your search' : 'No pickup stations'}
              message={search ? 'Try a different name, district or address.' : 'Add the first station so customers can choose pickup at checkout.'}
              action={
                !search && (
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditor({})}>
                    <MapPin size={13} aria-hidden="true" />
                    Create station
                  </button>
                )
              }
            />
          }
        />
      )}

      {editor && (
        <StationFormModal
          station={editor.id ? editor : null}
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
        title={toggleTarget?.isActive ? 'Deactivate this station?' : 'Activate this station?'}
        message={
          toggleTarget?.isActive
            ? `"${toggleTarget?.name}" will no longer be offered at checkout or listed on the storefront. Existing orders keep their station.`
            : `"${toggleTarget?.name}" will be listed on the storefront and offered at checkout again.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
        danger={Boolean(toggleTarget?.isActive)}
        busy={toggleBusy}
        onConfirm={handleToggleActive}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}
