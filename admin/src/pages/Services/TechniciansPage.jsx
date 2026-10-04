import { useCallback, useEffect, useState } from 'react';
import { Pencil, Phone, Plus, Save } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { hasRole, useAuth, CATALOG_ROLES } from '../../context/AuthContext';
import './Services.css';

const EMPTY = { fullName: '', phone: '', coverage: '', notes: '', isActive: true, serviceIds: [] };

/** Technicians who carry out home-service jobs: /api/admin/services/providers */
export default function TechniciansPage() {
  const { role } = useAuth();
  const canEdit = hasRole(role, CATALOG_ROLES);
  const { showToast } = useToast();
  const [providers, setProviders] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, s] = await Promise.all([api.get('/admin/services/providers'), api.get('/admin/services/catalog')]);
      setProviders(p?.data?.providers || []);
      setServices(s?.data?.services || []);
    } catch (err) {
      setError(err.message || 'Unable to load technicians.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (p) => {
    setEditing(p || 'new');
    setForm(p ? { fullName: p.fullName, phone: p.phone, coverage: p.coverage || '', notes: p.notes || '', isActive: p.isActive, serviceIds: p.services.map((s) => s.id) } : EMPTY);
    setFormError(null);
  };

  const toggleSkill = (id) =>
    setForm((f) => ({ ...f, serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id] }));

  const save = async (e) => {
    e.preventDefault();
    if (form.fullName.trim().length < 2) return setFormError('Enter the technician’s full name.');
    if (!/^(?:\+?256|0)?[37]\d{8}$/.test(form.phone.replace(/[\s\-().]/g, ''))) return setFormError('Enter a valid Ugandan phone number.');
    setSaving(true);
    setFormError(null);
    const payload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      coverage: form.coverage.trim() || null,
      notes: form.notes.trim() || null,
      isActive: form.isActive,
      serviceIds: form.serviceIds,
    };
    try {
      if (editing === 'new') await api.post('/admin/services/providers', payload);
      else await api.put(`/admin/services/providers/${editing.id}`, payload);
      showToast(editing === 'new' ? 'Technician added.' : 'Technician updated.', { type: 'success' });
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: 'fullName',
      header: 'Technician',
      render: (p) => (
        <span className="cell-stack">
          <strong>{p.fullName}</strong>
          <a href={`tel:${p.phone}`} className="table-link">
            <Phone size={12} aria-hidden="true" /> {p.phone}
          </a>
        </span>
      ),
    },
    {
      key: 'services',
      header: 'Services',
      render: (p) =>
        p.services.length ? (
          <span className="skill-list">
            {p.services.map((s) => (
              <span key={s.id} className="badge badge--info">
                {s.name}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted">None</span>
        ),
    },
    { key: 'coverage', header: 'Covers', render: (p) => p.coverage || '—' },
    { key: 'activeJobs', header: 'Active jobs', render: (p) => p.activeJobs ?? 0 },
    { key: 'isActive', header: 'Status', render: (p) => (p.isActive ? <span className="badge badge--success">Available</span> : <span className="badge badge--neutral">Inactive</span>) },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            render: (p) => (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEditor(p)}>
                <Pencil size={13} aria-hidden="true" /> Edit
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Technicians"
        description="Vetted plumbers, electricians, cleaners and other technicians you assign to bookings. Customers see the assigned technician's name and phone."
        actions={
          canEdit && (
            <button type="button" className="btn btn--primary" onClick={() => openEditor(null)}>
              <Plus size={15} aria-hidden="true" /> Add technician
            </button>
          )
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={providers}
          isLoading={loading}
          skeleton={<div className="panel panel-pad text-muted">Loading technicians…</div>}
          emptyState={<EmptyState title="No technicians yet" message="Add the technicians you work with so you can assign them to bookings." />}
        />
      )}

      <Modal open={Boolean(editing)} title={editing === 'new' ? 'Add technician' : 'Edit technician'} onClose={() => setEditing(null)} busy={saving} width={600}>
        <form onSubmit={save} noValidate>
          {formError && (
            <div className="alert alert--error" role="alert" style={{ marginBottom: 12 }}>
              <span>{formError}</span>
            </div>
          )}
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="tech-name" className="required">
                Full name
              </label>
              <input id="tech-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} disabled={saving} />
            </div>
            <div className="form-field">
              <label htmlFor="tech-phone" className="required">
                Phone
              </label>
              <input id="tech-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07XX XXX XXX" disabled={saving} />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="tech-cov">Areas covered</label>
            <input id="tech-cov" value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value.slice(0, 300) })} placeholder="e.g. Kampala, Wakiso, Mukono" disabled={saving} />
          </div>
          <div className="form-field">
            <label>Services offered</label>
            <div className="check-grid">
              {services.map((s) => (
                <label key={s.id}>
                  <input type="checkbox" checked={form.serviceIds.includes(s.id)} onChange={() => toggleSkill(s.id)} disabled={saving} /> {s.name}
                </label>
              ))}
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="tech-notes">Internal notes</label>
            <textarea id="tech-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={saving} />
          </div>
          <label className="toolbar__check">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} disabled={saving} /> Available for new jobs
          </label>
          <div className="modal__actions">
            <button type="button" className="btn btn--secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              <Save size={14} aria-hidden="true" /> {saving ? 'Saving…' : 'Save technician'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
