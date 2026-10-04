import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, Landmark, MapPin, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import apiClient from '../../api/client';
import AddressForm, { EMPTY_ADDRESS } from '../../Components/AddressForm/AddressForm';
import ConfirmDialog from '../../Components/ui/ConfirmDialog';
import { useAuth } from '../../Context/AuthContext';
import { useLanguage } from '../../Context/LanguageContext';
import { friendlyError } from '../../utils/errors';
import { addressLabelKey, formatAddressLine } from '../../utils/useLocations';
import './Addresses.css';

/**
 * Saved delivery addresses (validated Uganda locations):
 *   GET    /api/addresses              list
 *   POST   /api/addresses              create (server validates district + pin)
 *   PUT    /api/addresses/:id          edit (full re-validation)
 *   PATCH  /api/addresses/:id/default  make default
 *   DELETE /api/addresses/:id          remove (orders keep their snapshot)
 */
const Addresses = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | address id
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await apiClient.get('/addresses');
      if (Array.isArray(res?.data?.addresses)) setAddresses(res.data.addresses);
    } catch (err) {
      setError(friendlyError(err, t, 'addressesLoadError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const openNew = () => {
    setEditing('new');
    setForm({ ...EMPTY_ADDRESS, contactPhone: user?.phone || '', isDefault: addresses.length === 0 });
    setError(null);
    setMessage(null);
  };

  const openEdit = (addr) => {
    setEditing(addr.id);
    setForm({
      ...EMPTY_ADDRESS,
      ...addr,
      division: addr.division || '',
      landmark: addr.landmark || '',
      contactPhone: addr.contactPhone || user?.phone || ''
    });
    setError(null);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (address) => {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      if (editing === 'new') await apiClient.post('/addresses', address);
      else await apiClient.put(`/addresses/${editing}`, address);
      setMessage(t('addressSaved'));
      setEditing(null);
      setForm(EMPTY_ADDRESS);
      await fetchAddresses();
    } catch (err) {
      setError(friendlyError(err, t, 'saveAddressFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const makeDefault = async (addr) => {
    setError(null);
    try {
      const res = await apiClient.patch(`/addresses/${addr.id}/default`);
      if (Array.isArray(res?.data?.addresses)) setAddresses(res.data.addresses);
    } catch (err) {
      setError(friendlyError(err, t, 'saveAddressFailed'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/addresses/${deleteTarget.id}`);
      setMessage(t('addressDeleted'));
      setDeleteTarget(null);
      await fetchAddresses();
    } catch (err) {
      setError(friendlyError(err, t, 'addressDeleteFailed'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="panel account-card">
      <div className="account-card__head">
        <div>
          <h2>{t('addressesTitle')}</h2>
          <p className="section-desc">{t('addressesSubtitle')}</p>
        </div>
        {!editing && (
          <button type="button" className="btn btn-sm btn-primary" onClick={openNew}>
            <Plus size={15} aria-hidden="true" /> {t('addNewAddressBtn')}
          </button>
        )}
      </div>

      {message && (
        <div className="alert alert-success" role="status">
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {editing && (
        <AddressForm
          idPrefix="addr"
          heading={editing === 'new' ? t('addNewLocation') : t('editAddress')}
          value={form}
          onChange={setForm}
          onSubmit={handleSave}
          onCancel={() => setEditing(null)}
          submitting={submitting}
          defaultPhone={user?.phone || ''}
        />
      )}

      {loading ? (
        <div className="um-subview-loading" role="status">
          <div className="um-spinner" />
          <p>{t('loading')}</p>
        </div>
      ) : addresses.length === 0 && !editing ? (
        <div className="state-block">
          <span className="state-block__icon">
            <MapPin size={34} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <p>{t('noAddresses')}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>
            {t('addFirstAddress')}
          </button>
        </div>
      ) : (
        <ul className="addr-grid">
          {addresses.map((addr) => {
            const hasPin = Number.isFinite(addr.latitude) && Number.isFinite(addr.longitude);
            return (
              <li key={addr.id} className={`addr ${addr.isDefault ? 'addr--default' : ''}`}>
                <div className="addr__head">
                  <span className="addr__pin">
                    <MapPin size={16} aria-hidden="true" />
                  </span>
                  <strong>{addressLabelKey(addr.title) ? t(addressLabelKey(addr.title)) : addr.title || t('addressFallback')}</strong>
                  {addr.isDefault && <span className="badge badge-success">{t('defaultBadge')}</span>}
                  {addr.isVerified && (
                    <span className="badge badge-info" title={t('verifiedHint')}>
                      <BadgeCheck size={12} aria-hidden="true" /> {t('verified')}
                    </span>
                  )}
                </div>
                <p className="addr__line">{formatAddressLine(addr)}</p>
                {addr.landmark && (
                  <p className="addr__meta">
                    <Landmark size={13} aria-hidden="true" /> {addr.landmark}
                  </p>
                )}
                {addr.contactPhone && (
                  <p className="addr__meta">
                    <Phone size={13} aria-hidden="true" /> {addr.contactPhone}
                  </p>
                )}
                {!hasPin && (
                  <p className="addr__warn">
                    <AlertTriangle size={13} aria-hidden="true" /> {t('addressNeedsPin')}
                  </p>
                )}
                <div className="addr__actions">
                  <button type="button" onClick={() => openEdit(addr)} className="btn btn-secondary btn-sm">
                    <Pencil size={14} aria-hidden="true" /> {t('edit')}
                  </button>
                  {!addr.isDefault && (
                    <button type="button" onClick={() => makeDefault(addr)} className="btn btn-secondary btn-sm">
                      <Star size={14} aria-hidden="true" /> {t('makeDefault')}
                    </button>
                  )}
                  <button type="button" onClick={() => setDeleteTarget(addr)} className="btn btn-secondary btn-sm addr__delete" aria-label={`${t('delete')}: ${addr.title}`}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('deleteAddressTitle')}
        message={t('deleteAddressMessage')}
        confirmLabel={t('delete')}
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Addresses;
