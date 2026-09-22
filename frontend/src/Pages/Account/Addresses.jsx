import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Plus, Trash2, X } from 'lucide-react';
import apiClient from '../../api/client';
import AddressForm, { EMPTY_ADDRESS } from '../../Components/AddressForm/AddressForm';
import ConfirmDialog from '../../Components/ui/ConfirmDialog';
import { useLanguage } from '../../Context/LanguageContext';
import { friendlyError } from '../../utils/errors';
import './Addresses.css';

/**
 * Saved addresses — consumes the real backend contract:
 *   GET    /api/addresses      -> { data: { addresses } }
 *   POST   /api/addresses      -> { data: { address } }
 *   DELETE /api/addresses/:id  -> { success, message }
 * Ownership is enforced server-side; the frontend never sends a userId.
 */
const Addresses = () => {
  const { t } = useLanguage();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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

  const handleSave = async (address) => {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiClient.post('/addresses', address);
      if (res?.data?.address) {
        setMessage(t('addressSaved'));
        setShowForm(false);
        setForm(EMPTY_ADDRESS);
        await fetchAddresses();
      }
    } catch (err) {
      setError(friendlyError(err, t, 'saveAddressFailed'));
    } finally {
      setSubmitting(false);
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
        <h2>{t('addressesTitle')}</h2>
        <button
          type="button"
          className={`btn btn-sm ${showForm ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => {
            setShowForm((s) => !s);
            setError(null);
            setMessage(null);
          }}
        >
          {showForm ? (
            <>
              <X size={15} aria-hidden="true" /> {t('closeForm')}
            </>
          ) : (
            <>
              <Plus size={15} aria-hidden="true" /> {t('addNewAddressBtn')}
            </>
          )}
        </button>
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

      {showForm && (
        <AddressForm idPrefix="addr" heading={t('addNewLocation')} value={form} onChange={setForm} onSubmit={handleSave} submitting={submitting} />
      )}

      {loading ? (
        <div className="um-subview-loading" role="status">
          <div className="um-spinner" />
          <p>{t('loading')}</p>
        </div>
      ) : addresses.length === 0 ? (
        <div className="state-block">
          <span className="state-block__icon">
            <MapPin size={34} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <p>{t('noAddresses')}</p>
          {!showForm && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(true)}>
              {t('addFirstAddress')}
            </button>
          )}
        </div>
      ) : (
        <ul className="addr-grid">
          {addresses.map((addr) => (
            <li key={addr.id} className="addr">
              <div className="addr__head">
                <span className="addr__pin">
                  <MapPin size={16} aria-hidden="true" />
                </span>
                <strong>{addr.title || t('addressFallback')}</strong>
                {addr.isDefault && <span className="badge badge-success">{t('defaultBadge')}</span>}
              </div>
              <p>
                {addr.streetAddress}
                {addr.division ? `, ${addr.division}` : ''}
                {addr.district ? `, ${addr.district}` : ''}
              </p>
              <button type="button" onClick={() => setDeleteTarget(addr)} className="btn btn-secondary btn-sm addr__delete">
                <Trash2 size={14} aria-hidden="true" /> {t('delete')}
              </button>
            </li>
          ))}
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
