import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Crosshair, Loader2, MapPin, Search } from 'lucide-react';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';
import { LIMITS, sanitizeLine } from '../../utils/inputGuards';
import useDebouncedValue from '../../utils/useDebouncedValue';
import { REGION_KEYS, useLocationMeta } from '../../utils/useLocations';
import MapPicker from '../MapPicker/MapPicker';
import './AddressForm.css';

export const EMPTY_ADDRESS = {
  title: 'Home',
  region: '',
  district: '',
  division: '',
  streetAddress: '',
  landmark: '',
  contactPhone: '',
  latitude: null,
  longitude: null,
  isDefault: false
};

const LABELS = ['Home', 'Work', 'Other'];
const UG_PHONE = /^(?:\+?256|0)?[37]\d{8}$/;

/**
 * Delivery address form (Uganda).
 *
 * The exact location comes from the map pin, which customers set by
 * searching their area, using their phone's GPS or tapping the map. The pin
 * is reverse-geocoded to fill in district and area. The backend re-validates
 * everything (district exists, pin inside Uganda and inside that district,
 * valid phone) — this form only guides the customer to a correct address.
 */
const AddressForm = ({
  idPrefix = 'addr',
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting = false,
  submitLabel,
  heading,
  footnote,
  defaultPhone = ''
}) => {
  const { t } = useLanguage();
  const { districts, loading: metaLoading } = useLocationMeta();
  const [touched, setTouched] = useState({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pinInfo, setPinInfo] = useState(null); // { status: 'ok'|'outside'|'checking', label }
  const [geoError, setGeoError] = useState(null);
  const debounced = useDebouncedValue(query, 350);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  });

  // Prefill the rider contact with the account phone.
  useEffect(() => {
    if (!value.contactPhone && defaultPhone) onChange({ ...value, contactPhone: defaultPhone });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPhone]);

  const grouped = useMemo(() => {
    const byRegion = {};
    districts.forEach((d) => {
      (byRegion[d.region] = byRegion[d.region] || []).push(d);
    });
    Object.values(byRegion).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return byRegion;
  }, [districts]);

  const regionOf = (districtName) => districts.find((d) => d.name === districtName)?.region || '';

  // Area search (dataset + OpenStreetMap through the backend)
  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    let alive = true;
    setSearching(true);
    apiClient
      .get(`/locations/search?q=${encodeURIComponent(q)}`)
      .then((res) => alive && setResults(res?.data?.results || []))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setSearching(false));
    return () => {
      alive = false;
    };
  }, [debounced]);

  /** Ask the backend what is at the pin and fill district/area from it. */
  const describePin = async (lat, lng, { keepArea = false } = {}) => {
    setPinInfo({ status: 'checking' });
    try {
      const res = await apiClient.get(`/locations/reverse?lat=${lat}&lng=${lng}`);
      const info = res?.data || {};
      if (!info.insideUganda) {
        setPinInfo({ status: 'outside' });
        return;
      }
      const current = valueRef.current;
      onChange({
        ...current,
        latitude: lat,
        longitude: lng,
        district: info.district || current.district,
        region: info.region || regionOf(info.district) || current.region,
        division: keepArea && current.division ? current.division : info.area || current.division
      });
      setPinInfo({ status: 'ok', label: info.label || [info.area, info.district].filter(Boolean).join(', ') });
    } catch {
      setPinInfo(null);
    }
  };

  const setPin = ({ lat, lng }) => {
    onChange({ ...valueRef.current, latitude: lat, longitude: lng });
    describePin(lat, lng);
  };

  const pickResult = (r) => {
    setQuery('');
    setResults([]);
    onChange({
      ...valueRef.current,
      latitude: r.lat,
      longitude: r.lng,
      district: r.district || valueRef.current.district,
      region: r.region || regionOf(r.district),
      division: r.type === 'DISTRICT' ? valueRef.current.division : r.name
    });
    describePin(r.lat, r.lng, { keepArea: r.type !== 'DISTRICT' });
  };

  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError(t('geoUnsupported'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === 1 ? t('geoDenied') : t('geoFailed'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const set = (field, max) => (e) => onChange({ ...value, [field]: sanitizeLine(e.target.value, max) });
  const blur = (field) => () => setTouched((prev) => ({ ...prev, [field]: true }));

  const hasPin = Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
  const phoneOk = UG_PHONE.test(String(value.contactPhone || '').replace(/[\s\-().]/g, ''));
  const errors = {
    pin: !hasPin ? t('errPinRequired') : pinInfo?.status === 'outside' ? t('errPinOutside') : null,
    district: !value.district ? t('errDistrictRequired') : null,
    streetAddress: String(value.streetAddress || '').trim().length < 3 ? t('errStreetRequired') : null,
    contactPhone: !phoneOk ? t('errPhoneInvalid') : null
  };
  const show = (field) => (touched[field] || touched.all) && errors[field];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (Object.values(errors).some(Boolean)) {
      setTouched({ all: true });
      return;
    }
    onSubmit({
      title: (value.title || 'Home').trim(),
      region: value.region || regionOf(value.district) || undefined,
      district: value.district,
      division: (value.division || '').trim() || null,
      streetAddress: value.streetAddress.trim(),
      landmark: (value.landmark || '').trim() || null,
      contactPhone: value.contactPhone.trim(),
      latitude: value.latitude,
      longitude: value.longitude,
      isDefault: Boolean(value.isDefault)
    });
  };

  return (
    <form onSubmit={handleSubmit} className="card address-form" noValidate>
      {heading && <h3 className="address-form__title">{heading}</h3>}

      {/* Step 1: exact location */}
      <section className="af-step">
        <div className="af-step__head">
          <span className="af-step__num">1</span>
          <div>
            <strong>{t('afPinTitle')}</strong>
            <p>{t('afPinDesc')}</p>
          </div>
        </div>

        <div className="af-locate">
          <div className="af-search">
            <Search size={16} aria-hidden="true" className="af-search__icon" />
            <input
              id={`${idPrefix}-search`}
              type="search"
              className="form-input"
              placeholder={t('afSearchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(sanitizeLine(e.target.value, 120))}
              aria-label={t('afSearchPlaceholder')}
              autoComplete="off"
            />
            {searching && <Loader2 size={16} className="af-search__spin" aria-hidden="true" />}
            {results.length > 0 && (
              <ul className="af-results" role="listbox">
                {results.map((r) => (
                  <li key={`${r.label}-${r.lat}-${r.lng}`}>
                    <button type="button" onClick={() => pickResult(r)} role="option" aria-selected="false">
                      <MapPin size={14} aria-hidden="true" />
                      <span>
                        <strong>{r.name}</strong>
                        <small>{r.district && !r.label.includes(r.district) ? `${r.label} · ${r.district}` : r.label}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="btn btn-secondary af-gps" onClick={useMyLocation} disabled={locating}>
            {locating ? <Loader2 size={16} className="af-search__spin" aria-hidden="true" /> : <Crosshair size={16} aria-hidden="true" />}
            {t('afUseMyLocation')}
          </button>
        </div>
        {geoError && <p className="field-error">{geoError}</p>}

        <MapPicker value={hasPin ? { lat: value.latitude, lng: value.longitude } : null} onChange={setPin} height={280} label={t('afMapLabel')} />

        <div className="af-pin-status" aria-live="polite">
          {!hasPin && <span className="af-hint">{t('afTapMap')}</span>}
          {hasPin && pinInfo?.status === 'checking' && (
            <span className="af-hint">
              <Loader2 size={14} className="af-search__spin" aria-hidden="true" /> {t('afChecking')}
            </span>
          )}
          {hasPin && pinInfo?.status === 'ok' && (
            <span className="af-ok">
              <CheckCircle2 size={15} aria-hidden="true" /> {pinInfo.label || t('afPinSet')}
            </span>
          )}
          {hasPin && pinInfo?.status === 'outside' && (
            <span className="field-error">
              <AlertTriangle size={14} aria-hidden="true" /> {t('errPinOutside')}
            </span>
          )}
          {hasPin && !pinInfo && <span className="af-ok"><CheckCircle2 size={15} aria-hidden="true" /> {t('afPinSet')}</span>}
        </div>
        {show('pin') && pinInfo?.status !== 'outside' && <span className="field-error">{errors.pin}</span>}
      </section>

      {/* Step 2: address details */}
      <section className="af-step">
        <div className="af-step__head">
          <span className="af-step__num">2</span>
          <div>
            <strong>{t('afDetailsTitle')}</strong>
            <p>{t('afDetailsDesc')}</p>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor={`${idPrefix}-district`}>
              {t('district')} <span className="req">*</span>
            </label>
            <select
              id={`${idPrefix}-district`}
              className="form-select"
              value={value.district}
              onChange={(e) => onChange({ ...value, district: e.target.value, region: regionOf(e.target.value) })}
              onBlur={blur('district')}
              disabled={metaLoading}
              aria-invalid={Boolean(show('district')) || undefined}
            >
              <option value="">{metaLoading ? t('loading') : t('afChooseDistrict')}</option>
              {['CENTRAL', 'EASTERN', 'NORTHERN', 'WESTERN'].map((region) =>
                grouped[region] ? (
                  <optgroup key={region} label={t(REGION_KEYS[region])}>
                    {grouped[region].map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null
              )}
            </select>
            {value.district && regionOf(value.district) && (
              <span className="input-hint">
                {t('afRegionHint', { region: t(REGION_KEYS[regionOf(value.district)]) })}
              </span>
            )}
            {show('district') && <span className="field-error">{errors.district}</span>}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`${idPrefix}-division`}>
              {t('afArea')} <span className="input-hint">({t('optional')})</span>
            </label>
            <input
              id={`${idPrefix}-division`}
              type="text"
              className="form-input"
              placeholder={t('afAreaPlaceholder')}
              value={value.division || ''}
              onChange={set('division', LIMITS.district)}
              maxLength={LIMITS.district}
              autoComplete="address-level3"
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-street`}>
            {t('afStreet')} <span className="req">*</span>
          </label>
          <input
            id={`${idPrefix}-street`}
            type="text"
            className="form-input"
            placeholder={t('afStreetPlaceholder')}
            value={value.streetAddress}
            onChange={set('streetAddress', LIMITS.street)}
            onBlur={blur('streetAddress')}
            maxLength={LIMITS.street}
            aria-invalid={Boolean(show('streetAddress')) || undefined}
            autoComplete="street-address"
          />
          {show('streetAddress') && <span className="field-error">{errors.streetAddress}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-landmark`}>
            {t('afLandmark')} <span className="input-hint">({t('afRecommended')})</span>
          </label>
          <input
            id={`${idPrefix}-landmark`}
            type="text"
            className="form-input"
            placeholder={t('afLandmarkPlaceholder')}
            value={value.landmark || ''}
            onChange={set('landmark', LIMITS.street)}
            maxLength={LIMITS.street}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor={`${idPrefix}-phone`}>
              {t('afContactPhone')} <span className="req">*</span>
            </label>
            <input
              id={`${idPrefix}-phone`}
              type="tel"
              inputMode="tel"
              className="form-input"
              placeholder="07XX XXX XXX"
              value={value.contactPhone || ''}
              onChange={set('contactPhone', 20)}
              onBlur={blur('contactPhone')}
              maxLength={20}
              aria-invalid={Boolean(show('contactPhone')) || undefined}
              autoComplete="tel"
            />
            {show('contactPhone') && <span className="field-error">{errors.contactPhone}</span>}
          </div>
          <div className="form-group">
            <span className="form-label">{t('addressLabel')}</span>
            <div className="af-chips" role="radiogroup" aria-label={t('addressLabel')}>
              {LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={value.title === label}
                  className={`af-chip ${value.title === label ? 'af-chip--on' : ''}`}
                  onClick={() => onChange({ ...value, title: label })}
                >
                  {t(`afLabel${label}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="check-row" htmlFor={`${idPrefix}-default`}>
          <input type="checkbox" id={`${idPrefix}-default`} checked={Boolean(value.isDefault)} onChange={(e) => onChange({ ...value, isDefault: e.target.checked })} />
          <span>{t('setDefaultAddress')}</span>
        </label>
      </section>

      {footnote && <p className="input-hint af-footnote">{footnote}</p>}

      <div className="af-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
            {t('cancel')}
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? t('afValidating') : submitLabel || t('saveAddress')}
        </button>
      </div>
    </form>
  );
};

export default AddressForm;
