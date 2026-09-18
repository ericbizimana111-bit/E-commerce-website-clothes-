import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { useAuth } from '../../Context/AuthContext';
import { useLanguage } from '../../Context/LanguageContext';

const Addresses = () => {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    recipientName: user?.fullName || '',
    phone: user?.phone || '',
    addressLine: '',
    city: 'Kampala',
    district: 'Kampala',
    deliveryNotes: '',
    isDefault: false
  });

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/addresses');
      if (res?.data) {
        setAddresses(res.data);
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
      if (res?.data) {
        setMessage('Address saved successfully!');
        setShowAddForm(false);
        setForm({
          recipientName: user?.fullName || '',
          phone: user?.phone || '',
          addressLine: '',
          city: 'Kampala',
          district: 'Kampala',
          deliveryNotes: '',
          isDefault: false
        });
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
        <div className="alert alert-success">
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span>⚠️ {error}</span>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="um-new-address-form card" style={{ marginBottom: '1.5rem' }}>
          <h4>Add New Delivery Location</h4>
          <div className="form-group">
            <label className="form-label">Recipient Full Name *</label>
            <input
              type="text"
              required
              className="form-input"
              value={form.recipientName}
              onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Uganda Phone Number (07XXXXXXXX) *</label>
            <input
              type="tel"
              required
              placeholder="0770000000"
              className="form-input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Address Line / Street / Landmark *</label>
            <input
              type="text"
              required
              placeholder="e.g. Plot 15 Bukoto Street, opposite market"
              className="form-input"
              value={form.addressLine}
              onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">City *</label>
              <input
                type="text"
                required
                className="form-input"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">District *</label>
              <input
                type="text"
                required
                className="form-input"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Special Delivery Directions (optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Near blue gate, call before arrival"
              value={form.deliveryNotes}
              onChange={(e) => setForm({ ...form, deliveryNotes: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="isDefault"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            <label htmlFor="isDefault" style={{ cursor: 'pointer', fontSize: '0.88rem' }}>
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
                <strong style={{ fontSize: '1rem', color: 'var(--dark)' }}>{addr.recipientName}</strong>
                {addr.isDefault && <span className="badge badge-success">Default</span>}
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--slate)' }}>📞 {addr.phone}</span>
              <p style={{ fontSize: '0.9rem', color: 'var(--slate)', margin: '0.25rem 0' }}>
                {addr.addressLine}, {addr.city || addr.district}
              </p>
              {addr.deliveryNotes && (
                <small style={{ color: 'var(--muted)' }}>Note: {addr.deliveryNotes}</small>
              )}

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
