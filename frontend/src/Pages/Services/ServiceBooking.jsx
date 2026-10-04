import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarDays, Clock, Info, Lock, Plus, ShieldCheck, Smartphone } from 'lucide-react';
import apiClient from '../../api/client';
import AddressForm, { EMPTY_ADDRESS } from '../../Components/AddressForm/AddressForm';
import { useAuth } from '../../Context/AuthContext';
import { useLanguage } from '../../Context/LanguageContext';
import { friendlyError } from '../../utils/errors';
import { iconFor } from '../../utils/categoryIcons';
import { addressLabelKey, formatAddressLine } from '../../utils/useLocations';
import { priceLabel } from './Services';
import './Services.css';

const SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'];

/** Kampala (EAT, UTC+3) calendar date `days` from today, as YYYY-MM-DD. */
function kampalaDate(days = 0) {
  return new Date(Date.now() + 3 * 3600 * 1000 + days * 86400000).toISOString().slice(0, 10);
}

/**
 * Service details + booking form.
 *   GET  /api/services/:slug
 *   POST /api/service-requests { serviceId, addressId, description, preferredDate, preferredSlot, contactPhone }
 * Price, status and technician are always decided by UgaMarket staff.
 */
const ServiceBooking = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t, currentLang } = useLanguage();
  const { isAuthenticated, user } = useAuth();

  const [service, setService] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState('');
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState(EMPTY_ADDRESS);
  const [savingAddress, setSavingAddress] = useState(false);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(kampalaDate(1));
  const [slot, setSlot] = useState('MORNING');
  const [contactPhone, setContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoadState('loading');
    apiClient
      .get(`/services/${encodeURIComponent(slug)}?lang=${currentLang}`)
      .then((res) => {
        if (!alive) return;
        setService(res?.data?.service || null);
        setLoadState('ready');
      })
      .catch(() => alive && setLoadState('error'));
    return () => {
      alive = false;
    };
  }, [slug, currentLang]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let alive = true;
    apiClient
      .get('/addresses')
      .then((res) => {
        if (!alive) return;
        const list = (res?.data?.addresses || []).filter((a) => Number.isFinite(a.latitude));
        setAddresses(list);
        if (list.length) setAddressId((list.find((a) => a.isDefault) || list[0]).id);
        else setShowNewAddress(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const selected = addresses.find((a) => a.id === addressId);
    setContactPhone(selected?.contactPhone || user?.phone || '');
  }, [addressId, addresses, user]);

  const minDate = useMemo(() => kampalaDate(0), []);
  const maxDate = useMemo(() => kampalaDate(60), []);
  const descError = description.trim().length < 10 ? t('errDescribeProblem') : null;

  const saveAddress = async (address) => {
    setSavingAddress(true);
    setError(null);
    try {
      const res = await apiClient.post('/addresses', address);
      const created = res?.data?.address;
      if (created) {
        setAddresses((prev) => [created, ...prev]);
        setAddressId(created.id);
        setShowNewAddress(false);
        setNewAddress(EMPTY_ADDRESS);
      }
    } catch (err) {
      setError(friendlyError(err, t, 'saveAddressFailed'));
    } finally {
      setSavingAddress(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (descError || !addressId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiClient.post('/service-requests', {
        serviceId: service.id,
        addressId,
        description: description.trim(),
        preferredDate: date,
        preferredSlot: slot,
        contactPhone: contactPhone.trim() || undefined
      });
      const created = res?.data?.request;
      navigate(`/account/services/${created.id}?booked=1`);
    } catch (err) {
      setError(friendlyError(err, t, 'bookingFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadState === 'loading') {
    return (
      <div className="container um-loading-box" role="status" style={{ padding: '5rem 1rem' }}>
        <div className="um-spinner" />
        <p>{t('loading')}</p>
      </div>
    );
  }
  if (loadState === 'error' || !service) {
    return (
      <div className="container">
        <div className="state-block panel">
          <AlertTriangle size={32} aria-hidden="true" />
          <h1>{t('serviceNotFound')}</h1>
          <Link to="/services" className="btn btn-primary">
            {t('allServices')}
          </Link>
        </div>
      </div>
    );
  }

  const Icon = iconFor(service.icon);

  return (
    <div className="container svc-book">
      <Link to="/services" className="svc-book__back">
        <ArrowLeft size={15} aria-hidden="true" /> {t('allServices')}
      </Link>

      <div className="svc-book__layout">
        <section className="panel svc-book__info">
          <span className="svc-card__icon svc-card__icon--lg">
            <Icon size={34} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <h1 className="page-title">{service.name}</h1>
          {service.description && <p className="section-desc">{service.description}</p>}
          <dl className="svc-book__facts">
            <div>
              <dt>{t('priceLabel')}</dt>
              <dd>{priceLabel(service, t)}</dd>
            </div>
            {service.durationText && (
              <div>
                <dt>{t('typicalDuration')}</dt>
                <dd>{service.durationText}</dd>
              </div>
            )}
          </dl>
          {service.priceType === 'INSPECTION' && (
            <p className="svc-book__note">
              <Info size={15} aria-hidden="true" /> {t('inspectionNote')}
            </p>
          )}
          <ul className="services__promises">
            <li>
              <ShieldCheck size={16} aria-hidden="true" /> {t('servicesPromise2')}
            </li>
            <li>
              <Smartphone size={16} aria-hidden="true" /> {t('servicesPromise3')}
            </li>
          </ul>
        </section>

        <section className="panel svc-book__form">
          <h2>{t('bookThisService')}</h2>
          {!isAuthenticated ? (
            <div className="state-block">
              <Lock size={28} aria-hidden="true" />
              <p>{t('signInToBook')}</p>
              <Link to={`/login?redirect=${encodeURIComponent(`/services/${slug}`)}`} className="btn btn-primary">
                {t('signIn')}
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              {error && (
                <div className="alert alert-error" role="alert">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="svc-desc">
                  {t('describeProblem')} <span className="req">*</span>
                </label>
                <textarea
                  id="svc-desc"
                  className="form-textarea"
                  rows={4}
                  placeholder={t('describeProblemPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                  aria-invalid={(touched && Boolean(descError)) || undefined}
                />
                {touched && descError && <span className="field-error">{descError}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="svc-date">
                    <CalendarDays size={14} aria-hidden="true" /> {t('preferredDate')} <span className="req">*</span>
                  </label>
                  <input id="svc-date" type="date" className="form-input" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <span className="form-label">
                    <Clock size={14} aria-hidden="true" /> {t('preferredTime')} <span className="req">*</span>
                  </span>
                  <div className="svc-slots" role="radiogroup" aria-label={t('preferredTime')}>
                    {SLOTS.map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={slot === s} className={`af-chip ${slot === s ? 'af-chip--on' : ''}`} onClick={() => setSlot(s)}>
                        {t(`slot${s}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="checkout__row">
                <span className="form-label">
                  {t('serviceAddress')} <span className="req">*</span>
                </span>
                {addresses.length > 0 && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewAddress((s) => !s)}>
                    <Plus size={14} aria-hidden="true" /> {showNewAddress ? t('cancel') : t('addNewAddressBtn')}
                  </button>
                )}
              </div>
              {!showNewAddress && addresses.length > 0 && (
                <div className="options" role="radiogroup" aria-label={t('serviceAddress')}>
                  {addresses.map((a) => (
                    <label key={a.id} className={`option ${addressId === a.id ? 'option--selected' : ''}`}>
                      <input type="radio" name="svcAddress" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                      <span className="option__body">
                        <strong>{addressLabelKey(a.title) ? t(addressLabelKey(a.title)) : a.title}</strong>
                        <span>{formatAddressLine(a)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {showNewAddress && (
                <AddressForm
                  idPrefix="svc-addr"
                  heading={t('enterLocation')}
                  value={newAddress}
                  onChange={setNewAddress}
                  onSubmit={saveAddress}
                  onCancel={addresses.length ? () => setShowNewAddress(false) : undefined}
                  submitting={savingAddress}
                  submitLabel={t('saveUseAddress')}
                  defaultPhone={user?.phone || ''}
                />
              )}

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label" htmlFor="svc-phone">
                  {t('technicianCalls')}
                </label>
                <input id="svc-phone" type="tel" className="form-input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value.slice(0, 20))} />
              </div>

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting || !addressId || showNewAddress}>
                {submitting ? t('booking') : t('requestBooking')}
              </button>
              <p className="input-hint svc-book__fine">{t('bookingFinePrint')}</p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};

export default ServiceBooking;
