import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';

/**
 * Addresses — UgaMarket — home to home.
 * Consumes the actual backend address contract:
 *   GET    /api/addresses        -> { data: { addresses } }
 *   POST   /api/addresses        -> { data: { address } }  (title, district, division, streetAddress, isDefault)
 *   DELETE /api/addresses/:id    -> { success, message }
 * Ownership is enforced server-side; the frontend never sends a userId.
 */
const Addresses = () => {
  const { t } = useLanguage();

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const emptyForm = {
    title: 'Home',
    district: 'Kampala',
    division: '',
    streetAddress: '',
    isDefault: false
  };
  const [form, setForm] = useState(emptyForm);

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/addresses');
      if (Array.isArray(res?.data?.addresses)) {
        setAddresses(res.data.addresses);
      }
    } catch (err) {
      console.error('Failed to load addresses', err);
      setError(err.message || 'Could not load addresses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, []);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await apiClient.post('/addresses', form);
      if (res?.data?.address) {
        setMessage('Address saved successfully!');
        setShowAddForm(false);
        setForm(emptyForm);
        fetchAddresses();
      }
    } catch (err) {
      setError(err.message || 'Failed to save address');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this delivery address?')) return;
    try {
      await apiClient.delete(`/addresses/${id}`);
      setMessage('Address deleted.');
      fetchAddresses();
    } catch (err) {
      setError(err.message || 'Failed to delete address');
    }
  };

  return (
    <div className="card um-subview-card">
      <div className="um-subview-header">
        <h2>{t('addresses')}</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            setShowAddForm(!showAddForm);
            setError(null);
            setMessage(null);
          }}
        >
          {showAddForm ? '✕ Close Form' : '+ Add New Address'}
        </button>
      </div>

      {message && (
        <div className="alert alert-success" role="status">
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <span>⚠️ {error}</span>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="um-new-address-form card" style={{ marginBottom: '1.5rem' }}>
          <h4>Add New Delivery Location</h4>
          <div className="form-group">
            <label className="form-label" htmlFor="addr-title">Address Label *</label>
            <input
              id="addr-title"
              type="text"
              required
              className="form-input"
              placeholder="e.g. Home, Office"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="addr-street">Street Address / Landmark *</label>
            <input
              id="addr-street"
              type="text"
              required
              className="form-input"
              placeholder="e.g. Plot 15 Bukoto Street, opposite the market"
              value={form.streetAddress}
              onChange={(e) => setForm({ ...form, streetAddress: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="addr-district">District *</label>
              <input
                id="addr-district"
                type="text"
                required
                className="form-input"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="addr-division">Division (optional)</label>
              <input
                id="addr-division"
                type="text"
                className="form-input"
                placeholder="e.g. Nakawa"
                value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="addr-isDefault"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            <label htmlFor="addr-isDefault" style={{ cursor: 'pointer', fontSize: '0.88rem' }}>
              Set as default delivery address
            </label>
          </div>

          <button type="submit" disabled={submitting} className="btn btn-primary btn-sm">
            {submitting ? 'Saving...' : 'Save Address'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="um-subview-loading">
          <div className="um-spinner" />
          <p>Loading addresses...</p>
        </div>
      ) : addresses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)' }}>
          <p>You have no saved delivery addresses yet.</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowAddForm(true)}
            style={{ marginTop: '0.5rem' }}
          >
            + Add Your First Address
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {addresses.map((addr) => (
            <div key={addr.id} className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '1rem', color: 'var(--dark)' }}>{addr.title || 'Address'}</strong>
                {addr.isDefault && <span className="badge badge-success">Default</span>}
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--slate)', margin: '0.25rem 0' }}>
                {addr.streetAddress}
                {addr.division ? `, ${addr.division}` : ''}
                {addr.district ? `, ${addr.district}` : ''}
              </p>

              <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => handleDelete(addr.id)}
                  className="btn btn-sm btn-danger"
                  style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Addresses;
