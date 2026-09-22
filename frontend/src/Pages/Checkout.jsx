import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Clock, Lock, MapPin, Plus, ShieldCheck, Truck, X } from 'lucide-react';
import apiClient from '../api/client';
import { useAuth } from '../Context/AuthContext';
import { useCart } from '../Context/CartContext';
import { useLanguage } from '../Context/LanguageContext';
import SlidingTabs from '../Components/ui/SlidingTabs';
import AddressForm, { EMPTY_ADDRESS } from '../Components/AddressForm/AddressForm';
import { formatUGX } from '../utils/currency';
import { friendlyError } from '../utils/errors';
import { LIMITS, sanitizeMultiline } from '../utils/inputGuards';
import './Checkout.css';

/**
 * Checkout — server-authoritative rules:
 *  - Totals / commitment / balance come ONLY from POST /api/checkout/preview.
 *  - Addresses come from GET/POST /api/addresses (ownership enforced server-side).
 *  - Pickup stations come from GET /api/pickup-stations (never hardcoded).
 *  - Orders are created via POST /api/orders, which revalidates stock, prices,
 *    fulfillment and computes the authoritative amounts in one transaction.
 */
const Checkout = () => {
  const { isAuthenticated, user } = useAuth();
  const { items, itemCount, refreshCart } = useCart();
  const { currentLang, t, getLocalizedField } = useLanguage();
  const navigate = useNavigate();

  const [fulfillmentMethod, setFulfillmentMethod] = useState('HOME_DELIVERY');
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [pickupStations, setPickupStations] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState(EMPTY_ADDRESS);
  const [savingAddress, setSavingAddress] = useState(false);

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) navigate('/login?redirect=/checkout');
  }, [isAuthenticated, navigate]);

  // Saved addresses + pickup stations
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let mounted = true;
    setDataLoading(true);

    (async () => {
      const [addrRes, stationRes] = await Promise.allSettled([apiClient.get('/addresses'), apiClient.get('/pickup-stations')]);
      if (!mounted) return;

      if (addrRes.status === 'fulfilled' && Array.isArray(addrRes.value?.data?.addresses)) {
        const list = addrRes.value.data.addresses;
        setAddresses(list);
        if (list.length > 0) setSelectedAddressId((list.find((a) => a.isDefault) || list[0]).id);
        else setShowNewAddress(true);
      }
      if (stationRes.status === 'fulfilled' && Array.isArray(stationRes.value?.data?.stations)) {
        const stations = stationRes.value.data.stations;
        setPickupStations(stations);
        if (stations.length > 0) setSelectedStationId(String(stations[0].id));
      }
      setDataLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  // Authoritative pricing from the server
  const fetchPreview = useCallback(async () => {
    if (items.length === 0) return;
    if (fulfillmentMethod === 'HOME_DELIVERY' && !selectedAddressId) return setPreview(null);
    if (fulfillmentMethod === 'PICKUP_STATION' && !selectedStationId) return setPreview(null);

    setPreviewLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.post('/checkout/preview', {
        fulfillmentMethod,
        ...(fulfillmentMethod === 'HOME_DELIVERY'
          ? { addressId: selectedAddressId }
          : { pickupStationId: Number(selectedStationId) })
      });
      if (res?.data?.checkout) setPreview(res.data.checkout);
    } catch (err) {
      setPreview(null);
      setErrorMessage(friendlyError(err, t, 'previewFailed'));
    } finally {
      setPreviewLoading(false);
    }
    // `t` only changes with the language; the preview does not depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, fulfillmentMethod, selectedAddressId, selectedStationId]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const handleSaveAddress = async (address) => {
    setErrorMessage(null);
    setSavingAddress(true);
    try {
      const res = await apiClient.post('/addresses', address);
      const created = res?.data?.address;
      if (created) {
        setAddresses((prev) => [created, ...prev]);
        setSelectedAddressId(created.id);
        setShowNewAddress(false);
        setNewAddress(EMPTY_ADDRESS);
      }
    } catch (err) {
      setErrorMessage(friendlyError(err, t, 'saveAddressFailed'));
    } finally {
      setSavingAddress(false);
    }
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (fulfillmentMethod === 'HOME_DELIVERY' && !selectedAddressId) return setErrorMessage(t('pleaseSelectAddress'));
    if (fulfillmentMethod === 'PICKUP_STATION' && !selectedStationId) return setErrorMessage(t('pleaseSelectStation'));

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.post('/orders', {
        fulfillmentMethod,
        ...(fulfillmentMethod === 'HOME_DELIVERY'
          ? { addressId: selectedAddressId }
          : { pickupStationId: Number(selectedStationId) }),
        ...(orderNotes.trim() ? { notes: orderNotes.trim() } : {}),
        language: currentLang || 'en'
      });
      const createdOrder = res?.data?.order || res?.data;
      if (!createdOrder?.id) throw new Error(t('noOrderId'));
      await refreshCart();
      navigate(`/account/orders/${createdOrder.id}`);
    } catch (err) {
      setErrorMessage(friendlyError(err, t, 'placeOrderFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const methodTabs = useMemo(
    () => [
      { value: 'HOME_DELIVERY', label: t('homeDelivery'), id: 'co-tab-home', controls: 'co-panel' },
      { value: 'PICKUP_STATION', label: t('pickupStation'), id: 'co-tab-pickup', controls: 'co-panel' }
    ],
    [t]
  );

  if (items.length === 0) {
    return (
      <div className="checkout container">
        <div className="state-block panel">
          <h1>{t('emptyCart')}</h1>
          <p>{t('addProduceFirst')}</p>
          <Link to="/catalog" className="btn btn-primary">
            {t('catalogTitle')}
          </Link>
        </div>
      </div>
    );
  }

  const pricing = preview?.pricing || null;
  const fulfillment = preview?.fulfillment || null;
  const subtotal = pricing?.subtotalUgx ?? null;
  const deliveryFee = fulfillment?.deliveryFeeUgx ?? null;
  const total = pricing?.totalUgx ?? null;
  const commitment = pricing?.commitmentUgx ?? null;
  const balance = pricing?.remainingBalanceUgx ?? null;
  const commitmentNote = pricing?.commitmentNote || null;
  const cartIssues = preview?.issues || [];
  const hasAll = total !== null && commitment !== null && deliveryFee !== null;
  const money = (value) => (value === null ? '…' : formatUGX(value));

  const steps = [
    { label: t('stepCart'), to: '/cart', done: true },
    { label: t('stepDelivery'), current: true },
    { label: t('stepDeposit') },
    { label: t('stepConfirmation') }
  ];

  return (
    <div className="checkout container">
      <nav className="steps" aria-label={t('checkoutProgress')}>
        <ol>
          {steps.map((step, i) => (
            <li key={step.label} className={`steps__item ${step.done ? 'steps__item--done' : ''} ${step.current ? 'steps__item--current' : ''}`} aria-current={step.current ? 'step' : undefined}>
              <span className="steps__dot">{step.done ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : i + 1}</span>
              {step.to ? <Link to={step.to}>{step.label}</Link> : <span>{step.label}</span>}
            </li>
          ))}
        </ol>
      </nav>

      <header className="checkout__head">
        <h1 className="page-title">{t('checkoutTitle')}</h1>
        <p className="section-desc">{t('checkoutSubtitle')}</p>
      </header>

      {errorMessage && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {cartIssues.length > 0 && (
        <div className="alert alert-error" role="alert">
          <div>
            <strong>{t('cartNeedsAttention')}</strong>
            <ul style={{ margin: '6px 0 6px 18px', listStyle: 'disc' }}>
              {cartIssues.map((issue) => (
                <li key={issue.cartItemId || issue.slug}>{issue.message}</li>
              ))}
            </ul>
            <Link to="/cart" style={{ fontWeight: 700, textDecoration: 'underline' }}>
              {t('reviewCart')}
            </Link>
          </div>
        </div>
      )}

      <div className="checkout__layout">
        <div className="checkout__main">
          <section className="card checkout__step">
            <h2 className="checkout__step-title">
              <span className="checkout__num">1</span>
              {t('fulfillmentMethod')}
            </h2>

            <SlidingTabs options={methodTabs} value={fulfillmentMethod} onChange={setFulfillmentMethod} ariaLabel={t('fulfillmentMethod')} full />

            <div id="co-panel" role="tabpanel" aria-labelledby={fulfillmentMethod === 'HOME_DELIVERY' ? 'co-tab-home' : 'co-tab-pickup'} className="checkout__panel" key={fulfillmentMethod}>
              {fulfillmentMethod === 'HOME_DELIVERY' ? (
                <>
                  <p className="checkout__method-desc">
                    <Truck size={16} aria-hidden="true" /> {t('homeDeliveryDesc')}
                  </p>

                  <div className="checkout__row">
                    <h3>{t('deliveryAddress')}</h3>
                    {addresses.length > 0 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewAddress((s) => !s)}>
                        {showNewAddress ? (
                          <>
                            <X size={14} aria-hidden="true" /> {t('cancel')}
                          </>
                        ) : (
                          <>
                            <Plus size={14} aria-hidden="true" /> {t('addNewAddressBtn')}
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {!showNewAddress && addresses.length > 0 && (
                    <div className="options" role="radiogroup" aria-label={t('deliveryAddress')}>
                      {addresses.map((addr) => (
                        <label key={addr.id} className={`option ${selectedAddressId === addr.id ? 'option--selected' : ''}`}>
                          <input type="radio" name="addressSelect" value={addr.id} checked={selectedAddressId === addr.id} onChange={() => setSelectedAddressId(addr.id)} />
                          <span className="option__body">
                            <strong>
                              {addr.title || t('addressFallback')}
                              {addr.isDefault && <span className="badge badge-success">{t('defaultBadge')}</span>}
                            </strong>
                            <span>
                              {addr.streetAddress}
                              {addr.division ? `, ${addr.division}` : ''}, {addr.district}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {!showNewAddress && dataLoading && (
                    <div className="um-subview-loading" role="status">
                      <div className="um-spinner" />
                      <p>{t('loadingAddresses')}</p>
                    </div>
                  )}

                  {showNewAddress && (
                    <AddressForm
                      idPrefix="co-addr"
                      heading={t('enterLocation')}
                      value={newAddress}
                      onChange={setNewAddress}
                      onSubmit={handleSaveAddress}
                      submitting={savingAddress}
                      submitLabel={t('saveUseAddress')}
                      footnote={t('deliveringAs', { name: user?.fullName || '', phone: user?.phone || '' })}
                    />
                  )}
                </>
              ) : (
                <>
                  <p className="checkout__method-desc">
                    <MapPin size={16} aria-hidden="true" /> {t('pickupStationDesc')}
                  </p>
                  <h3>{t('selectStation')}</h3>
                  {dataLoading && (
                    <div className="um-subview-loading" role="status">
                      <div className="um-spinner" />
                      <p>{t('loadingStations')}</p>
                    </div>
                  )}
                  <div className="options" role="radiogroup" aria-label={t('selectStation')}>
                    {pickupStations.map((station) => (
                      <label key={station.id} className={`option ${selectedStationId === String(station.id) ? 'option--selected' : ''}`}>
                        <input type="radio" name="stationSelect" value={station.id} checked={selectedStationId === String(station.id)} onChange={() => setSelectedStationId(String(station.id))} />
                        <span className="option__body">
                          <strong>{station.name}</strong>
                          <span>
                            {station.addressText}, {station.district}
                          </span>
                          <span className="option__hours">
                            <Clock size={13} aria-hidden="true" /> {station.operatingHours || t('contactForHours')}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="card checkout__step">
            <h2 className="checkout__step-title">
              <span className="checkout__num">2</span>
              {t('notesStep')}
            </h2>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="co-notes">
                {t('notesLabel')} <span className="input-hint">({t('optional')})</span>
              </label>
              <textarea
                id="co-notes"
                className="form-textarea"
                rows="3"
                placeholder={t('notesPlaceholder')}
                value={orderNotes}
                onChange={(e) => setOrderNotes(sanitizeMultiline(e.target.value, LIMITS.notes))}
                maxLength={LIMITS.notes}
              />
              <span className="input-hint" style={{ textAlign: 'right' }}>
                {t('notesCounter', { used: orderNotes.length, max: LIMITS.notes })}
              </span>
            </div>
          </section>
        </div>

        <aside className="checkout__summary card" aria-label={t('orderOverview')}>
          <h2>
            {t('orderOverview')} ({t('itemsCount', { count: itemCount })})
          </h2>

          <ul className="checkout__items">
            {items.map((item) => {
              const product = item.product || {};
              return (
                <li key={item.id}>
                  <span>
                    {item.quantity}× {getLocalizedField(product, 'name') || product.name || t('freshItem')}
                  </span>
                  <span>{formatUGX(item.subtotalUgx || item.unitPriceUgx * item.quantity)}</span>
                </li>
              );
            })}
          </ul>

          <dl className="checkout__totals">
            <div>
              <dt>{t('subtotal')}</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            <div>
              <dt>{t('deliveryFee')}</dt>
              <dd>{deliveryFee === null ? '…' : deliveryFee === 0 ? t('freePickup') : formatUGX(deliveryFee)}</dd>
            </div>
            <div className="checkout__grand">
              <dt>{t('totalOrderValue')}</dt>
              <dd>{money(total)}</dd>
            </div>
          </dl>
          {preview && !previewLoading && (
            <p className="checkout__confirmed">
              <Check size={13} strokeWidth={3} aria-hidden="true" /> {t('serverConfirmed')}
            </p>
          )}

          <div className="checkout__split">
            <div>
              <div>
                <strong>
                  {t('commitmentDeposit')} — {t('payNowSuffix')}
                </strong>
                <span>{t('requiredNow')}</span>
              </div>
              <strong className="checkout__deposit">{money(commitment)}</strong>
            </div>
            <div>
              <div>
                <strong>
                  {t('balancePayable')} — {t('payAtFulfillmentSuffix')}
                </strong>
                <span>{t('afterInspection')}</span>
              </div>
              <strong>{money(balance)}</strong>
            </div>
            {commitmentNote && <p className="checkout__note">{commitmentNote}</p>}
          </div>

          <button type="button" onClick={handlePlaceOrder} disabled={submitting || previewLoading || !hasAll} className="btn btn-primary btn-lg btn-block">
            {submitting ? t('placingOrder') : previewLoading || !hasAll ? t('confirmingTotals') : t('placeOrderPay', { amount: formatUGX(commitment) })}
          </button>

          <ul className="checkout__secure">
            <li>
              <Lock size={14} aria-hidden="true" /> {t('checkoutSecured')}
            </li>
            <li>
              <ShieldCheck size={14} aria-hidden="true" /> {t('inspectBeforeBalance')}
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
};

export default Checkout;
