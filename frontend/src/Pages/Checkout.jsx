import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuth } from '../Context/AuthContext';
import { useCart } from '../Context/CartContext';
import { useLanguage } from '../Context/LanguageContext';
import { formatUGX } from '../utils/currency';
import './Checkout.css';

const Checkout = () => {
  const { isAuthenticated, user } = useAuth();
  const { items, itemCount, subtotalUgx, refreshCart } = useCart();
  const { currentLang, t } = useLanguage();
  const navigate = useNavigate();

  // Fulfillment State
  const [fulfillmentMethod, setFulfillmentMethod] = useState('HOME_DELIVERY');
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [pickupStations, setPickupStations] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // Add new address toggle/form
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState({
    recipientName: user?.fullName || '',
    phone: user?.phone || '',
    addressLine: '',
    city: 'Kampala',
    district: 'Kampala',
    deliveryNotes: ''
  });

  // Server checkout preview state
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Auth Guard
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login?redirect=/checkout');
    }
  }, [isAuthenticated, navigate]);

  // Load addresses & pickup stations
  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;

    const loadFulfillmentData = async () => {
      try {
        const [addrRes, stationRes] = await Promise.allSettled([
          apiClient.get('/addresses'),
          apiClient.get('/pickup-stations')
        ]);

        if (isMounted) {
          if (addrRes.status === 'fulfilled' && addrRes.value?.data) {
            const list = addrRes.value.data;
            setAddresses(list);
            if (list.length > 0) {
              const def = list.find((a) => a.isDefault) || list[0];
              setSelectedAddressId(def.id);
            } else {
              setShowNewAddressForm(true);
            }
          }

          if (stationRes.status === 'fulfilled' && stationRes.value?.data) {
            const stations = stationRes.value.data;
            setPickupStations(stations);
            if (stations.length > 0) {
              setSelectedStationId(stations[0].id.toString());
            }
          }
        }
      } catch (err) {
        console.error('Failed to load fulfillment data', err);
      }
    };

    loadFulfillmentData();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  // Server checkout preview fetch
  const fetchCheckoutPreview = useCallback(async () => {
    if (items.length === 0) return;

    if (fulfillmentMethod === 'HOME_DELIVERY' && !selectedAddressId) {
      setPreview(null);
      return;
    }
    if (fulfillmentMethod === 'PICKUP_STATION' && !selectedStationId) {
      setPreview(null);
      return;
    }

    setPreviewLoading(true);
    setErrorMessage(null);

    try {
      const payload = {
        fulfillmentMethod,
        ...(fulfillmentMethod === 'HOME_DELIVERY'
          ? { addressId: selectedAddressId }
          : { pickupStationId: Number(selectedStationId) })
      };

      const res = await apiClient.post('/checkout/preview', payload);
      if (res?.data) {
        setPreview(res.data);
      }
    } catch (err) {
      console.warn('Checkout preview error', err);
      setErrorMessage(err.message || 'Unable to calculate checkout totals');
    } finally {
      setPreviewLoading(false);
    }
  }, [items.length, fulfillmentMethod, selectedAddressId, selectedStationId]);

  useEffect(() => {
    fetchCheckoutPreview();
  }, [fetchCheckoutPreview]);

  // Handle saving new address
  const handleSaveNewAddress = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const res = await apiClient.post('/addresses', newAddress);
      if (res?.data) {
        setAddresses((prev) => [res.data, ...prev]);
        setSelectedAddressId(res.data.id);
        setShowNewAddressForm(false);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to save address');
    }
  };

  // Place Order
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (fulfillmentMethod === 'HOME_DELIVERY' && !selectedAddressId) {
      setErrorMessage('Please select or add a delivery address');
      return;
    }
    if (fulfillmentMethod === 'PICKUP_STATION' && !selectedStationId) {
      setErrorMessage('Please select a pickup station');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        fulfillmentMethod,
        ...(fulfillmentMethod === 'HOME_DELIVERY'
          ? { addressId: selectedAddressId }
          : { pickupStationId: Number(selectedStationId) }),
        ...(orderNotes.trim() ? { notes: orderNotes.trim() } : {}),
        language: currentLang || 'en'
      };

      const res = await apiClient.post('/orders', payload);
      const createdOrder = res?.data?.order || res?.data;

      if (createdOrder?.id) {
        // Refresh cart so client knows server cart is cleared
        await refreshCart();
        // Redirect to order details to review or pay commitment
        navigate(`/account/orders/${createdOrder.id}`);
      } else {
        throw new Error('Order creation did not return an order ID');
      }
    } catch (err) {
      console.error('Failed to create order', err);
      setErrorMessage(err.message || 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="um-checkout-page">
        <div className="container">
          <div className="um-empty-checkout card">
            <h2>Your cart is empty</h2>
            <p>Please add fresh farm produce before proceeding to checkout.</p>
            <Link to="/catalog" className="btn btn-primary">
              Browse Food Catalog
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Fallback estimates if preview is not yet fetched
  const displaySubtotal = preview?.subtotalUgx ?? subtotalUgx;
  const displayDeliveryFee = preview?.deliveryFeeUgx ?? (fulfillmentMethod === 'HOME_DELIVERY' ? 5000 : 0);
  const displayTotal = preview?.totalUgx ?? (displaySubtotal + displayDeliveryFee);
  const displayCommitment = preview?.commitmentUgx ?? Math.round(displayTotal * 0.10);
  const displayBalance = preview?.remainingBalanceUgx ?? (displayTotal - displayCommitment);

  return (
    <div className="um-checkout-page">
      <div className="container">
        <div className="um-checkout-header">
          <h1 className="um-checkout-title">Checkout</h1>
          <p className="um-checkout-subtitle">
            Secure farm-to-door fulfillment • 10% Commitment Deposit
          </p>
        </div>

        {errorMessage && (
          <div className="alert alert-error">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        <div className="um-checkout-layout">
          {/* Main Form Area */}
          <div className="um-checkout-main">
            {/* Step 1: Fulfillment Method */}
            <div className="um-checkout-step card">
              <div className="um-step-heading">
                <span className="um-step-badge-num">1</span>
                <h3>Choose Fulfillment Method</h3>
              </div>

              <div className="um-fulfillment-tabs">
                <button
                  type="button"
                  className={`um-tab-btn ${fulfillmentMethod === 'HOME_DELIVERY' ? 'um-tab-btn--active' : ''}`}
                  onClick={() => setFulfillmentMethod('HOME_DELIVERY')}
                >
                  <span className="um-tab-icon">🚚</span>
                  <div>
                    <strong>{t('homeDelivery')}</strong>
                    <span>Direct to your doorstep in Kampala</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`um-tab-btn ${fulfillmentMethod === 'PICKUP_STATION' ? 'um-tab-btn--active' : ''}`}
                  onClick={() => setFulfillmentMethod('PICKUP_STATION')}
                >
                  <span className="um-tab-icon">📍</span>
                  <div>
                    <strong>{t('pickupStation')} (Free)</strong>
                    <span>Collect at a secure neighborhood station</span>
                  </div>
                </button>
              </div>

              {/* Home Delivery Address Selector */}
              {fulfillmentMethod === 'HOME_DELIVERY' && (
                <div className="um-address-section">
                  <div className="um-address-section-header">
                    <h4>Delivery Address</h4>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowNewAddressForm(!showNewAddressForm)}
                    >
                      {showNewAddressForm ? 'Cancel' : '+ Add New Address'}
                    </button>
                  </div>

                  {/* Existing Addresses */}
                  {!showNewAddressForm && addresses.length > 0 && (
                    <div className="um-address-list">
                      {addresses.map((addr) => (
                        <label
                          key={addr.id}
                          className={`um-address-option ${selectedAddressId === addr.id ? 'um-address-option--selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name="addressSelect"
                            value={addr.id}
                            checked={selectedAddressId === addr.id}
                            onChange={() => setSelectedAddressId(addr.id)}
                          />
                          <div className="um-address-details">
                            <strong>{addr.recipientName || user?.fullName}</strong>
                            <span>📞 {addr.phone || user?.phone}</span>
                            <p>{addr.addressLine}, {addr.city || addr.district}</p>
                            {addr.deliveryNotes && (
                              <small className="um-addr-notes">Note: {addr.deliveryNotes}</small>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Add New Address Form */}
                  {showNewAddressForm && (
                    <form onSubmit={handleSaveNewAddress} className="um-new-address-form card">
                      <h5>Enter Delivery Location</h5>
                      <div className="form-group">
                        <label className="form-label">Recipient Full Name *</label>
                        <input
                          type="text"
                          required
                          className="form-input"
                          value={newAddress.recipientName}
                          onChange={(e) => setNewAddress({ ...newAddress, recipientName: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Uganda Phone Number (07XXXXXXXX) *</label>
                        <input
                          type="tel"
                          required
                          className="form-input"
                          placeholder="0770000000"
                          value={newAddress.phone}
                          onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Physical Address / Street / Landmark *</label>
                        <input
                          type="text"
                          required
                          className="form-input"
                          placeholder="e.g. Plot 12 Ntinda Road, near Shell"
                          value={newAddress.addressLine}
                          onChange={(e) => setNewAddress({ ...newAddress, addressLine: e.target.value })}
                        />
                      </div>
                      <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label">City / Town *</label>
                          <input
                            type="text"
                            required
                            className="form-input"
                            value={newAddress.city}
                            onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                          />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label">District *</label>
                          <input
                            type="text"
                            required
                            className="form-input"
                            value={newAddress.district}
                            onChange={(e) => setNewAddress({ ...newAddress, district: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Delivery Instructions (optional)</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Call when outside the black gate"
                          value={newAddress.deliveryNotes}
                          onChange={(e) => setNewAddress({ ...newAddress, deliveryNotes: e.target.value })}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary btn-sm">
                        Save & Use Address
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Pickup Stations Selector */}
              {fulfillmentMethod === 'PICKUP_STATION' && (
                <div className="um-stations-selection">
                  <h4>Select a Pickup Station</h4>
                  <div className="um-station-options-grid">
                    {pickupStations.map((station) => (
                      <label
                        key={station.id}
                        className={`um-station-card ${selectedStationId === station.id.toString() ? 'um-station-card--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="stationSelect"
                          value={station.id}
                          checked={selectedStationId === station.id.toString()}
                          onChange={() => setSelectedStationId(station.id.toString())}
                        />
                        <div className="um-station-body">
                          <strong>📍 {station.name}</strong>
                          <p>{station.addressLine}, {station.district || station.city}</p>
                          <span className="um-station-hrs">🕒 {station.operatingHours || '8:00 AM - 7:00 PM'}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Order Notes */}
            <div className="um-checkout-step card">
              <div className="um-step-heading">
                <span className="um-step-badge-num">2</span>
                <h3>Special Instructions & Packaging</h3>
              </div>
              <div className="form-group">
                <label className="form-label">Harvest & Delivery Notes (Optional)</label>
                <textarea
                  className="form-textarea"
                  rows="3"
                  placeholder="e.g. Please pick ripe matooke fingers, leave with security guard if not available."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Sidebar Summary */}
          <div className="um-checkout-sidebar">
            <div className="um-checkout-review card">
              <h3 className="um-review-title">Order Overview ({itemCount} {itemCount === 1 ? 'item' : 'items'})</h3>

              <div className="um-review-items">
                {items.map((item) => {
                  const product = item.product || {};
                  return (
                    <div key={item.id} className="um-review-item-row">
                      <span className="um-review-item-name">
                        {item.quantity}x {product.name || 'Fresh item'}
                      </span>
                      <span className="um-review-item-price">
                        {formatUGX(item.subtotalUgx || (item.unitPriceUgx * item.quantity))}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="um-review-totals">
                <div className="um-review-row">
                  <span>Subtotal</span>
                  <span>{formatUGX(displaySubtotal)}</span>
                </div>
                <div className="um-review-row">
                  <span>Fulfillment Fee</span>
                  <span>
                    {displayDeliveryFee === 0 ? 'FREE (Pickup)' : formatUGX(displayDeliveryFee)}
                  </span>
                </div>
                <div className="um-review-row um-review-total-row">
                  <strong>Total Order Value</strong>
                  <strong className="um-review-total-ugx">{formatUGX(displayTotal)}</strong>
                </div>
              </div>

              {/* 10% / 90% Financial Breakdown Card */}
              <div className="um-checkout-breakdown card">
                <div className="um-breakdown-row">
                  <div>
                    <strong className="um-breakdown-title">10% Commitment Deposit</strong>
                    <span className="um-breakdown-sub">Required now to initiate farm harvest</span>
                  </div>
                  <strong className="um-breakdown-amount um-deposit-val">
                    {formatUGX(displayCommitment)}
                  </strong>
                </div>
                <div className="um-breakdown-divider" />
                <div className="um-breakdown-row">
                  <div>
                    <strong className="um-breakdown-title">90% Remaining Balance</strong>
                    <span className="um-breakdown-sub">Payable upon fulfillment after inspection</span>
                  </div>
                  <strong className="um-breakdown-amount">
                    {formatUGX(displayBalance)}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={submitting || previewLoading}
                className="btn btn-primary btn-lg btn-block um-place-order-btn"
              >
                {submitting ? 'Placing Order...' : `Confirm & Pay 10% (${formatUGX(displayCommitment)})`} →
              </button>

              <div className="um-checkout-security">
                <span>🔒 Encrypted Server-Authoritative Checkout</span>
                <span>🛡️ Inspect Quality at Delivery Before Final 90%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
