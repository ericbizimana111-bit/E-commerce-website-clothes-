import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Check, Clock, Lock, MapPin, Phone, Plus, Route, ShieldCheck, Smartphone, Truck, X } from 'lucide-react';
import apiClient from '../api/client';
import { useAuth } from '../Context/AuthContext';
import { useCart } from '../Context/CartContext';
import { useLanguage } from '../Context/LanguageContext';
import AddressForm, { EMPTY_ADDRESS } from '../Components/AddressForm/AddressForm';
import { formatUGX } from '../utils/currency';
import { friendlyError } from '../utils/errors';
import { LIMITS, sanitizeMultiline } from '../utils/inputGuards';
import { addressLabelKey, formatAddressLine } from '../utils/useLocations';
import './Checkout.css';

/**
 * Checkout — UgaMarket delivers every order to a validated address.
 *  - Addresses: GET/POST /api/addresses (district + map pin validated server-side)
 *  - Totals:    POST /api/checkout/preview { addressId } (road-distance fee, ETA)
 *  - Order:     POST /api/orders { addressId, notes } — the server recomputes
 *               stock, prices, distance and fee in one transaction.
 */
const Checkout = () => {
  const { isAuthenticated, user } = useAuth();
  const { items, itemCount, refreshCart } = useCart();
  const { currentLang, t, getLocalizedField } = useLanguage();
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
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

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let mounted = true;
    setDataLoading(true);
    apiClient
      .get('/addresses')
      .then((res) => {
        if (!mounted) return;
        const list = Array.isArray(res?.data?.addresses) ? res.data.addresses : [];
        setAddresses(list);
        const usable = list.filter((a) => Number.isFinite(a.latitude));
        if (usable.length > 0) setSelectedAddressId((usable.find((a) => a.isDefault) || usable[0]).id);
        else setShowNewAddress(true);
      })
      .catch((err) => mounted && setErrorMessage(friendlyError(err, t, 'addressesLoadError')))
      .finally(() => mounted && setDataLoading(false));
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const fetchPreview = useCallback(async () => {
    if (items.length === 0) return;
    if (!selectedAddressId) return setPreview(null);
    setPreviewLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.post('/checkout/preview', { addressId: selectedAddressId });
      if (res?.data?.checkout) setPreview(res.data.checkout);
    } catch (err) {
      setPreview(null);
      setErrorMessage(friendlyError(err, t, 'previewFailed'));
    } finally {
      setPreviewLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, selectedAddressId]);

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
        setAddresses((prev) => [created, ...prev.map((a) => (created.isDefault ? { ...a, isDefault: false } : a))]);
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
    if (!selectedAddressId) return setErrorMessage(t('pleaseSelectAddress'));

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.post('/orders', {
        addressId: selectedAddressId,
        ...(orderNotes.trim() ? { notes: orderNotes.trim() } : {}),
        language: currentLang || 'en'
      });
      const createdOrder = res?.data?.order || res?.data;
      if (!createdOrder?.id) throw new Error(t('noOrderId'));
      await refreshCart();
      navigate(`/account/orders/${createdOrder.id}?placed=1`);
    } catch (err) {
      setErrorMessage(friendlyError(err, t, 'placeOrderFailed'));
    } finally {
      setSubmitting(false);
    }
  };

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
  const cartIssues = preview?.issues || [];
  const hasAll = total !== null && commitment !== null && deliveryFee !== null;
  const money = (value) => (value === null ? '…' : formatUGX(value));
  const selected = addresses.find((a) => a.id === selectedAddressId) || null;

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
        <p className="section-desc">{t('checkoutSubtitleDelivery')}</p>
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
              {t('deliveryAddress')}
            </h2>
            <p className="checkout__method-desc">
              <Truck size={16} aria-hidden="true" /> {t('deliveryOnlyDesc')}
            </p>

            <div className="checkout__row">
              <h3>{t('chooseAddress')}</h3>
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

            {dataLoading && (
              <div className="um-subview-loading" role="status">
                <div className="um-spinner" />
                <p>{t('loadingAddresses')}</p>
              </div>
            )}

            {!showNewAddress && addresses.length > 0 && (
              <div className="options" role="radiogroup" aria-label={t('deliveryAddress')}>
                {addresses.map((addr) => {
                  const usable = Number.isFinite(addr.latitude);
                  return (
                    <label key={addr.id} className={`option ${selectedAddressId === addr.id ? 'option--selected' : ''} ${usable ? '' : 'option--disabled'}`}>
                      <input
                        type="radio"
                        name="addressSelect"
                        value={addr.id}
                        checked={selectedAddressId === addr.id}
                        onChange={() => usable && setSelectedAddressId(addr.id)}
                        disabled={!usable}
                      />
                      <span className="option__body">
                        <strong>
                          {addressLabelKey(addr.title) ? t(addressLabelKey(addr.title)) : addr.title || t('addressFallback')}
                          {addr.isDefault && <span className="badge badge-success">{t('defaultBadge')}</span>}
                          {addr.isVerified && (
                            <span className="badge badge-info">
                              <BadgeCheck size={12} aria-hidden="true" /> {t('verified')}
                            </span>
                          )}
                        </strong>
                        <span>{formatAddressLine(addr)}</span>
                        {addr.landmark && <span className="option__hours">{addr.landmark}</span>}
                        {!usable && (
                          <span className="option__warn">
                            <AlertTriangle size={13} aria-hidden="true" /> {t('addressNeedsPin')}{' '}
                            <Link to="/account/addresses">{t('fixAddress')}</Link>
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {showNewAddress && (
              <AddressForm
                idPrefix="co-addr"
                heading={t('enterLocation')}
                value={newAddress}
                onChange={setNewAddress}
                onSubmit={handleSaveAddress}
                onCancel={addresses.length > 0 ? () => setShowNewAddress(false) : undefined}
                submitting={savingAddress}
                submitLabel={t('saveUseAddress')}
                defaultPhone={user?.phone || ''}
                footnote={t('deliveringAs', { name: user?.fullName || '', phone: user?.phone || '' })}
              />
            )}

            {selected && !showNewAddress && fulfillment && (
              <div className="co-route" aria-live="polite">
                <div>
                  <Route size={18} aria-hidden="true" />
                  <span>
                    <small>{t('distanceLabel')}</small>
                    <strong>{t('kmValue', { km: Number(fulfillment.distanceKm).toFixed(1) })}</strong>
                  </span>
                </div>
                <div>
                  <Clock size={18} aria-hidden="true" />
                  <span>
                    <small>{t('etaLabel')}</small>
                    <strong>{t('minutesValue', { min: fulfillment.etaMinutes })}</strong>
                  </span>
                </div>
                <div>
                  <Phone size={18} aria-hidden="true" />
                  <span>
                    <small>{t('riderCalls')}</small>
                    <strong>{selected.contactPhone || user?.phone}</strong>
                  </span>
                </div>
              </div>
            )}
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
                placeholder={t('notesPlaceholderDelivery')}
                value={orderNotes}
                onChange={(e) => setOrderNotes(sanitizeMultiline(e.target.value, LIMITS.notes))}
                maxLength={LIMITS.notes}
              />
              <span className="input-hint" style={{ textAlign: 'right' }}>
                {t('notesCounter', { used: orderNotes.length, max: LIMITS.notes })}
              </span>
            </div>
          </section>

          <section className="card checkout__step">
            <h2 className="checkout__step-title">
              <span className="checkout__num">3</span>
              {t('paymentMethodsTitle')}
            </h2>
            <div className="co-methods">
              <span className="co-method co-method--mtn">
                <Smartphone size={18} aria-hidden="true" /> MTN MoMo
              </span>
              <span className="co-method co-method--airtel">
                <Smartphone size={18} aria-hidden="true" /> Airtel Money
              </span>
            </div>
            <p className="input-hint">{t('paymentMethodsDesc')}</p>
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
              <dt>
                {t('deliveryFee')}
                {fulfillment?.distanceKm != null && <small className="checkout__km"> · {t('kmValue', { km: Number(fulfillment.distanceKm).toFixed(1) })}</small>}
              </dt>
              <dd>{money(deliveryFee)}</dd>
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
                  {t('balancePayable')} — {t('onDeliverySuffix')}
                </strong>
                <span>{t('afterInspection')}</span>
              </div>
              <strong>{money(balance)}</strong>
            </div>
          </div>

          <button type="button" onClick={handlePlaceOrder} disabled={submitting || previewLoading || !hasAll || cartIssues.length > 0} className="btn btn-primary btn-lg btn-block">
            {submitting ? t('placingOrder') : previewLoading || (!hasAll && selectedAddressId) ? t('confirmingTotals') : !selectedAddressId ? t('pleaseSelectAddress') : t('placeOrderPay', { amount: formatUGX(commitment) })}
          </button>

          <ul className="checkout__secure">
            <li>
              <Lock size={14} aria-hidden="true" /> {t('checkoutSecured')}
            </li>
            <li>
              <ShieldCheck size={14} aria-hidden="true" /> {t('inspectBeforeBalance')}
            </li>
            <li>
              <MapPin size={14} aria-hidden="true" /> {t('deliveryEverywhere')}
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
};

export default Checkout;
