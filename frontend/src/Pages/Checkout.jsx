import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuth } from '../Context/AuthContext';
import { useCart } from '../Context/CartContext';
import { useLanguage } from '../Context/LanguageContext';
import { formatUGX } from '../utils/currency';
import './Checkout.css';

/**
 * Checkout — UgaMarket — home to home.
 *
 * Server-authoritative rules:
 *  - Totals/commitment/balance come ONLY from POST /api/checkout/preview
 *    (read-only, server-calculated). No client financial math is authoritative.
 *  - Addresses come from GET/POST /api/addresses (ownership enforced server-side).
 *  - Pickup stations come from GET /api/pickup-stations (never hardcoded).
 *  - Orders are created via POST /api/orders, which revalidates stock, prices,
 *    fulfillment and computes the authoritative amounts in one transaction.
 */

const Checkout = () => {
  const { isAuthenticated, user } = useAuth();
  const { items, itemCount, refreshCart } = useCart();
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
    title: 'Home',
    district: 'Kampala',
    division: '',
    streetAddress: '',
    isDefault: false
  });

  // Server checkout preview state
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [fulfillmentDataLoading, setFulfillmentDataLoading] = useState(true);

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
    setFulfillmentDataLoading(true);

    const loadFulfillmentData = async () => {
      try {
        const [addrRes, stationRes] = await Promise.allSettled([
          apiClient.get('/addresses'),
          apiClient.get('/pickup-stations')
        ]);

        if (isMounted) {
          // GET /api/addresses -> { data: { addresses: [...] } }
          if (addrRes.status === 'fulfilled' && Array.isArray(addrRes.value?.data?.addresses)) {
            const list = addrRes.value.data.addresses;
            setAddresses(list);
            if (list.length > 0) {
              const def = list.find((a) => a.isDefault) || list[0];
              setSelectedAddressId(def.id);
            } else {
              setShowNewAddressForm(true);
            }
          }

          // GET /api/pickup-stations -> { data: { stations: [...] } }
          if (stationRes.status === 'fulfilled' && Array.isArray(stationRes.value?.data?.stations)) {
            const stations = stationRes.value.data.stations;
            setPickupStations(stations);
            if (stations.length > 0) {
              setSelectedStationId(stations[0].id.toString());
            }
          }
        }
      } catch (err) {
        console.error('Failed to load fulfillment data', err);
      } finally {
        if (isMounted) setFulfillmentDataLoading(false);
      }
    };

    loadFulfillmentData();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  // Server checkout preview fetch (authoritative pricing)
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

      // POST /api/checkout/preview -> { data: { checkout: { ready, issues, fulfillment, pricing, items } } }
      const res = await apiClient.post('/checkout/preview', payload);
      if (res?.data?.checkout) {
        setPreview(res.data.checkout);
      }
    } catch (err) {
      console.warn('Checkout preview error', err);
      setPreview(null);
      setErrorMessage(err.message || 'Unable to calculate checkout totals');
    } finally {
      setPreviewLoading(false);
    }
  }, [items.length, fulfillmentMethod, selectedAddressId, selectedStationId]);

  useEffect(() => {
    fetchCheckoutPreview();
  }, [fetchCheckoutPreview]);

  // Handle saving new address (backend Address model:
  // title, district, division, streetAddress, latitude, longitude, isDefault)
  const handleSaveNewAddress = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const res = await apiClient.post('/addresses', newAddress);
      // POST /api/addresses -> { data: { address } }
      const created = res?.data?.address;
      if (created) {
        setAddresses((prev) => [created, ...prev]);
        setSelectedAddressId(created.id);
        setShowNewAddressForm(false);
        setNewAddress({
          title: 'Home',
          district: 'Kampala',
          division: '',
          streetAddress: '',
          isDefault: false
        });
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to save address');
    }
  };

  // Place Order — POST /api/orders (server revalidates everything)
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
            <h2>{t('emptyCart')}</h2>
            <p>Please add fresh farm produce before proceeding to checkout.</p>
            <Link to="/catalog" className="btn btn-primary">
              {t('catalog')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Server-authoritative values (no client financial math).
  const pricing = preview?.pricing || null;
  const fulfillment = preview?.fulfillment || null;
  const displaySubtotal = pricing?.subtotalUgx ?? null;
  const displayDeliveryFee = fulfillment?.deliveryFeeUgx ?? null;
  const displayTotal = pricing?.totalUgx ?? null;
  const displayCommitment = pricing?.commitmentUgx ?? null;
  const displayBalance = pricing?.remainingBalanceUgx ?? null;
  const commitmentNote = pricing?.commitmentNote || null;
  const cartIssues = preview?.issues || [];

  const hasAllServerAmounts =
    displayTotal !== null && displayCommitment !== null && displayDeliveryFee !== null;

  const formatOrPending = (value) => (value === null ? '…' : formatUGX(value));

  return (
    <div className="um-checkout-page">
      <div className="container">
        {/* Checkout journey progress — Cart is done, Payment/Confirmation follow on the order page */}
        <nav className="um-checkout-progress" aria-label="Checkout progress">
          <ol className="um-progress-steps">
            <li className="um-progress-step um-progress-step--done">
              <Link to="/cart">Cart</Link>
            </li>
            <li className="um-progress-step um-progress-step--current" aria-current="step">
              <span>Delivery &amp; Review</span>
            </li>
            <li className="um-progress-step">
              <span>{t('commitmentDeposit')}</span>
            </li>
            <li className="um-progress-step">
              <span>Confirmation</span>
            </li>
          </ol>
        </nav>

        <div className="um-checkout-header">
          <h1 className="um-checkout-title">Checkout</h1>
          <p className="um-checkout-subtitle">
            {t('commitmentDeposit')} paid now • {t('balancePayable')} after your produce is inspected
          </p>
        </div>

        {errorMessage && (
          <div className="alert alert-error" role="alert">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        {/* Cart issues surfaced by the server (stale price / stock conflicts) */}
        {cartIssues.length > 0 && (
          <div className="alert alert-error" role="alert">
            <strong>Your cart needs attention:</strong>
            <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
              {cartIssues.map((issue) => (
                <li key={issue.cartItemId || issue.slug}>{issue.message}</li>
              ))}
            </ul>
            <Link to="/cart" style={{ display: 'inline-block', marginTop: '0.5rem', textDecoration: 'underline' }}>
              Review your cart →
            </Link>
          </div>
        )}

        <div className="um-checkout-layout">
          {/* Main Form Area */}
          <div className="um-checkout-main">
            {/* Step 1: Fulfillment Method */}
            <div className="um-checkout-step card">
              <div className="um-step-heading">
                <span className="um-step-badge-num">1</span>
                <h3>{t('fulfillmentMethod')}</h3>
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
                    <span>Direct to your doorstep</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`um-tab-btn ${fulfillmentMethod === 'PICKUP_STATION' ? 'um-tab-btn--active' : ''}`}
                  onClick={() => setFulfillmentMethod('PICKUP_STATION')}
                >
                  <span className="um-tab-icon">📍</span>
                  <div>
                    <strong>{t('pickupStation')}</strong>
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
                            <strong>
                              {addr.title || 'Address'}
                              {addr.isDefault && <span className="badge badge-success" style={{ marginLeft: '0.5rem' }}>Default</span>}
                            </strong>
                            <p>{addr.streetAddress}{addr.division ? `, ${addr.division}` : ''}, {addr.district}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {!showNewAddressForm && fulfillmentDataLoading && (
                    <div className="um-subview-loading" style={{ padding: '1.5rem' }}>
                      <div className="um-spinner" />
                      <p>Loading your addresses...</p>
                    </div>
                  )}

                  {/* Add New Address Form */}
                  {showNewAddressForm && (
                    <form onSubmit={handleSaveNewAddress} className="um-new-address-form card">
                      <h5>Enter Delivery Location</h5>
                      <div className="form-group">
                        <label className="form-label" htmlFor="co-addr-title">Address Label *</label>
                        <input
                          id="co-addr-title"
                          type="text"
                          required
                          className="form-input"
                          placeholder="e.g. Home, Office"
                          value={newAddress.title}
                          onChange={(e) => setNewAddress({ ...newAddress, title: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="co-addr-street">Street Address / Landmark *</label>
                        <input
                          id="co-addr-street"
                          type="text"
                          required
                          className="form-input"
                          placeholder="e.g. Plot 12 Ntinda Road, near the shell station"
                          value={newAddress.streetAddress}
                          onChange={(e) => setNewAddress({ ...newAddress, streetAddress: e.target.value })}
                        />
                      </div>
                      <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label" htmlFor="co-addr-district">District *</label>
                          <input
                            id="co-addr-district"
                            type="text"
                            required
                            className="form-input"
                            value={newAddress.district}
                            onChange={(e) => setNewAddress({ ...newAddress, district: e.target.value })}
                          />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label" htmlFor="co-addr-division">Division (optional)</label>
                          <input
                            id="co-addr-division"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Nakawa"
                            value={newAddress.division}
                            onChange={(e) => setNewAddress({ ...newAddress, division: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="checkbox"
                          id="co-addr-default"
                          checked={newAddress.isDefault}
                          onChange={(e) => setNewAddress({ ...newAddress, isDefault: e.target.checked })}
                        />
                        <label htmlFor="co-addr-default" style={{ cursor: 'pointer', fontSize: '0.88rem' }}>
                          Set as default delivery address
                        </label>
                      </div>
                      <p className="um-input-hint">
                        Delivering as <strong>{user?.fullName}</strong> ({user?.phone})
                      </p>
                      <button type="submit" className="btn btn-primary btn-sm">
                        Save &amp; Use Address
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Pickup Stations Selector */}
              {fulfillmentMethod === 'PICKUP_STATION' && (
                <div className="um-stations-selection">
                  <h4>Select a Pickup Station</h4>
                  {fulfillmentDataLoading && (
                    <div className="um-subview-loading" style={{ padding: '1.5rem' }}>
                      <div className="um-spinner" />
                      <p>Loading pickup stations...</p>
                    </div>
                  )}
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
                          <p>{station.addressText}, {station.district}</p>
                          <span className="um-station-hrs">🕒 {station.operatingHours || 'Contact station for hours'}</span>
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
                <h3>Special Instructions &amp; Packaging</h3>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="co-notes">Harvest &amp; Delivery Notes (Optional)</label>
                <textarea
                  id="co-notes"
                  className="form-textarea"
                  rows="3"
                  placeholder="e.g. Please pick ripe matooke fingers, leave with security guard if not available."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  maxLength={1000}
                />
              </div>
            </div>
          </div>

          {/* Sidebar Summary */}
          <div className="um-checkout-sidebar">
            <div className="um-checkout-review card">
              <h3 className="um-review-title">
                Order Overview ({itemCount} {itemCount === 1 ? 'item' : 'items'})
              </h3>

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
                  <span>{formatOrPending(displaySubtotal)}</span>
                </div>
                <div className="um-review-row">
                  <span>{t('deliveryFee')}</span>
                  <span>
                    {displayDeliveryFee === null
                      ? '…'
                      : displayDeliveryFee === 0
                        ? 'FREE (Pickup)'
                        : formatUGX(displayDeliveryFee)}
                  </span>
                </div>
                <div className="um-review-row um-review-total-row">
                  <strong>Total Order Value</strong>
                  <strong className="um-review-total-ugx">{formatOrPending(displayTotal)}</strong>
                </div>
                {preview && !previewLoading && (
                  <p className="um-review-server-note" style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                    ✓ Final amounts confirmed by UgaMarket
                  </p>
                )}
              </div>

              {/* Commitment / Balance breakdown — server-authoritative values */}
              <div className="um-checkout-breakdown card">
                <div className="um-breakdown-row">
                  <div>
                    <strong className="um-breakdown-title">{t('commitmentDeposit')} — Pay Now</strong>
                    <span className="um-breakdown-sub">Required now to initiate your order</span>
                  </div>
                  <strong className="um-breakdown-amount um-deposit-val">
                    {formatOrPending(displayCommitment)}
                  </strong>
                </div>
                <div className="um-breakdown-divider" />
                <div className="um-breakdown-row">
                  <div>
                    <strong className="um-breakdown-title">{t('balancePayable')} — Pay at Fulfillment</strong>
                    <span className="um-breakdown-sub">Payable after quality inspection</span>
                  </div>
                  <strong className="um-breakdown-amount">
                    {formatOrPending(displayBalance)}
                  </strong>
                </div>
                {commitmentNote && (
                  <p className="um-breakdown-note" style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                    {commitmentNote}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={submitting || previewLoading || !hasAllServerAmounts}
                className="btn btn-primary btn-lg btn-block um-place-order-btn"
              >
                {submitting
                  ? 'Placing your order...'
                  : previewLoading || !hasAllServerAmounts
                    ? 'Confirming your totals…'
                    : `Place Order — Pay ${formatUGX(displayCommitment)} Now`}
              </button>

              <div className="um-checkout-security">
            <span>🔒 Checkout secured by UgaMarket</span>
            <span>🛡️ Inspect quality before paying the balance</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
