import { useCallback, useEffect, useState } from 'react';
import { Languages, Pencil, Plus, Save } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import IconPicker from '../../components/ui/IconPicker';
import ImageDropzone from '../../components/ui/ImageDropzone';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { hasRole, useAuth, CATALOG_ROLES } from '../../context/AuthContext';
import { iconFor } from '../../utils/categoryIcons';
import { validateImageFile } from '../../utils/imageFiles';
import { formatUGX } from '../../utils/format';
import './Services.css';

const PRICE_TYPES = [
  { value: 'INSPECTION', label: 'Call-out fee, quote on site' },
  { value: 'FIXED', label: 'Fixed price for the job' },
  { value: 'HOURLY', label: 'Price per hour' },
];
const EMPTY = { name: '', description: '', icon: 'wrench', priceType: 'INSPECTION', priceFromUgx: '', durationText: '', displayOrder: '0', isActive: true };
const LANGS = { LG: 'Luganda', SW: 'Kiswahili', FR: 'French' };

/** Home-services catalogue (admin): GET/POST/PUT /api/admin/services/catalog */
export default function ServicesCatalogPage() {
  const { role } = useAuth();
  const canEdit = hasRole(role, CATALOG_ROLES);
  const { showToast } = useToast();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | service
  const [form, setForm] = useState(EMPTY);
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/admin/services/catalog');
      setServices(res?.data?.services || []);
    } catch (err) {
      setError(err.message || 'Unable to load services.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (service) => {
    setEditing(service || 'new');
    setForm(
      service
        ? {
            name: service.name,
            description: service.description || '',
            icon: service.icon || '',
            priceType: service.priceType,
            priceFromUgx: String(service.priceFromUgx ?? ''),
            durationText: service.durationText || '',
            displayOrder: String(service.displayOrder ?? 0),
            isActive: service.isActive,
          }
        : EMPTY,
    );
    setImage(null);
    setFormError(null);
  };

  const save = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setFormError('Enter the service name in English.');
    const price = Number(form.priceFromUgx || 0);
    if (!Number.isInteger(price) || price < 0) return setFormError('Price must be a whole number of UGX.');
    setSaving(true);
    setFormError(null);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      icon: form.icon || null,
      priceType: form.priceType,
      priceFromUgx: price,
      durationText: form.durationText.trim() || null,
      displayOrder: Math.max(0, Math.round(Number(form.displayOrder) || 0)),
      isActive: form.isActive,
    };
    try {
      const res = editing === 'new' ? await api.post('/admin/services/catalog', payload) : await api.put(`/admin/services/catalog/${editing.id}`, payload);
      const saved = res?.data?.service;
      if (image && saved?.id) {
        const data = new FormData();
        data.append('image', image);
        await api.post(`/admin/services/catalog/${saved.id}/image`, data);
      }
      showToast(editing === 'new' ? 'Service created. Translations are being generated.' : 'Service updated.', { type: 'success' });
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
      key: 'name',
      header: 'Service',
      render: (s) => {
        const Icon = iconFor(s.icon);
        return (
          <span className="svc-row-name">
            <span className="svc-row-icon">
              <Icon size={17} aria-hidden="true" />
            </span>
            <span className="cell-stack">
              <strong>{s.name}</strong>
              <small className="mono">{s.slug}</small>
            </span>
          </span>
        );
      },
    },
    { key: 'price', header: 'Price', render: (s) => `${formatUGX(s.priceFromUgx)} · ${PRICE_TYPES.find((p) => p.value === s.priceType)?.label}` },
    { key: 'durationText', header: 'Duration', render: (s) => s.durationText || '—' },
    { key: 'providerCount', header: 'Technicians', render: (s) => s.providerCount ?? 0 },
    { key: 'requestCount', header: 'Bookings', render: (s) => s.requestCount ?? 0 },
    {
      key: 'langs',
      header: 'Translations',
      render: (s) => {
        const done = Object.keys(LANGS).filter((l) => s.translations?.[l]);
        return done.length === 3 ? <span className="badge badge--success">Auto-translated</span> : <span className="badge badge--neutral">{done.length}/3</span>;
      },
    },
    { key: 'isActive', header: 'Status', render: (s) => (s.isActive ? <span className="badge badge--success">Active</span> : <span className="badge badge--neutral">Hidden</span>) },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            render: (s) => (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEditor(s)}>
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
        title="Service catalogue"
        description="Home services customers can book. Write in English — Luganda, Kiswahili and French are translated automatically."
        actions={
          canEdit && (
            <button type="button" className="btn btn--primary" onClick={() => openEditor(null)}>
              <Plus size={15} aria-hidden="true" /> New service
            </button>
          )
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={services}
          isLoading={loading}
          skeleton={<div className="panel panel-pad text-muted">Loading services…</div>}
          emptyState={<EmptyState title="No services yet" message="Add the home services customers can book." />}
        />
      )}

      <Modal open={Boolean(editing)} title={editing === 'new' ? 'New service' : 'Edit service'} onClose={() => setEditing(null)} busy={saving} width={620}>
        <form onSubmit={save} noValidate>
          {formError && (
            <div className="alert alert--error" role="alert" style={{ marginBottom: 12 }}>
              <span>{formError}</span>
            </div>
          )}
          <div className="form-field">
            <label htmlFor="svc-name" className="required">
              Service name (English)
            </label>
            <input id="svc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Plumbing" disabled={saving} />
          </div>
          <div className="form-field">
            <label htmlFor="svc-desc">Description (English)</label>
            <textarea id="svc-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What the technician does, what's included…" disabled={saving} />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="svc-ptype">Pricing</label>
              <select id="svc-ptype" value={form.priceType} onChange={(e) => setForm({ ...form, priceType: e.target.value })} disabled={saving}>
                {PRICE_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="svc-price">{form.priceType === 'INSPECTION' ? 'Call-out fee (UGX)' : form.priceType === 'HOURLY' ? 'Price per hour (UGX)' : 'Price (UGX)'}</label>
              <input id="svc-price" type="number" min="0" step="500" value={form.priceFromUgx} onChange={(e) => setForm({ ...form, priceFromUgx: e.target.value })} disabled={saving} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="svc-dur">Typical duration</label>
              <input id="svc-dur" value={form.durationText} onChange={(e) => setForm({ ...form, durationText: e.target.value.slice(0, 60) })} placeholder="e.g. 1–2 hours" disabled={saving} />
            </div>
            <div className="form-field">
              <label htmlFor="svc-order">Display order</label>
              <input id="svc-order" type="number" min="0" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} disabled={saving} />
            </div>
          </div>
          <div className="form-field">
            <label>Icon</label>
            <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} disabled={saving} />
          </div>
          <div className="form-field">
            <label>Image (optional)</label>
            <ImageDropzone
              id="svc-image"
              inputLabel="Choose service image"
              disabled={saving}
              idleText={image ? image.name : 'Drag an image here, or click to browse'}
              onFiles={(files) => {
                const f = files?.[0];
                const problem = f ? validateImageFile(f) : null;
                if (problem) setFormError(problem);
                else if (f) setImage(f);
              }}
            />
          </div>
          <label className="toolbar__check">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} disabled={saving} /> Visible to customers
          </label>

          {editing && editing !== 'new' && (
            <div className="auto-trans">
              <Languages size={15} aria-hidden="true" />
              <div>
                <strong>Automatic translations</strong>
                {Object.entries(LANGS).map(([code, label]) => (
                  <span key={code}>
                    {label}: {editing.translations?.[code]?.name || <em>pending</em>}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="modal__actions">
            <button type="button" className="btn btn--secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              <Save size={14} aria-hidden="true" /> {saving ? 'Saving…' : 'Save service'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
