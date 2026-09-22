import React, { useState } from 'react';
import { useLanguage } from '../../Context/LanguageContext';
import { LIMITS, sanitizeLine } from '../../utils/inputGuards';

export const EMPTY_ADDRESS = {
  title: 'Home',
  district: 'Kampala',
  division: '',
  streetAddress: '',
  isDefault: false
};

/**
 * Delivery address form shared by checkout and the account area.
 * Every field is length-capped and stripped of control characters as the
 * customer types; required fields are checked before submitting.
 */
const AddressForm = ({ idPrefix = 'addr', value, onChange, onSubmit, submitting = false, submitLabel, heading, footnote }) => {
  const { t } = useLanguage();
  const [touched, setTouched] = useState({});

  const set = (field, max) => (e) => onChange({ ...value, [field]: sanitizeLine(e.target.value, max) });
  const blur = (field) => () => setTouched((prev) => ({ ...prev, [field]: true }));

  const missing = (field) => touched[field] && !String(value[field] || '').trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    const required = ['title', 'streetAddress', 'district'];
    if (required.some((f) => !String(value[f] || '').trim())) {
      setTouched({ title: true, streetAddress: true, district: true });
      return;
    }
    onSubmit({
      ...value,
      title: value.title.trim(),
      streetAddress: value.streetAddress.trim(),
      district: value.district.trim(),
      division: value.division.trim()
    });
  };

  const err = (field) => (missing(field) ? <span className="field-error">{t('errRequired')}</span> : null);

  return (
    <form onSubmit={handleSubmit} className="card address-form" noValidate>
      {heading && <h3 className="address-form__title">{heading}</h3>}

      <div className="form-group">
        <label className="form-label" htmlFor={`${idPrefix}-title`}>
          {t('addressLabel')} <span className="req">*</span>
        </label>
        <input
          id={`${idPrefix}-title`}
          type="text"
          className="form-input"
          placeholder={t('addressLabelPlaceholder')}
          value={value.title}
          onChange={set('title', LIMITS.addressLabel)}
          onBlur={blur('title')}
          maxLength={LIMITS.addressLabel}
          aria-invalid={missing('title') || undefined}
          autoComplete="off"
        />
        {err('title')}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor={`${idPrefix}-street`}>
          {t('streetAddress')} <span className="req">*</span>
        </label>
        <input
          id={`${idPrefix}-street`}
          type="text"
          className="form-input"
          placeholder={t('streetPlaceholder')}
          value={value.streetAddress}
          onChange={set('streetAddress', LIMITS.street)}
          onBlur={blur('streetAddress')}
          maxLength={LIMITS.street}
          aria-invalid={missing('streetAddress') || undefined}
          autoComplete="street-address"
        />
        {err('streetAddress')}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-district`}>
            {t('district')} <span className="req">*</span>
          </label>
          <input
            id={`${idPrefix}-district`}
            type="text"
            className="form-input"
            value={value.district}
            onChange={set('district', LIMITS.district)}
            onBlur={blur('district')}
            maxLength={LIMITS.district}
            aria-invalid={missing('district') || undefined}
            autoComplete="address-level2"
          />
          {err('district')}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-division`}>
            {t('division')} <span className="input-hint">({t('optional')})</span>
          </label>
          <input
            id={`${idPrefix}-division`}
            type="text"
            className="form-input"
            placeholder={t('divisionPlaceholder')}
            value={value.division}
            onChange={set('division', LIMITS.district)}
            maxLength={LIMITS.district}
            autoComplete="address-level3"
          />
        </div>
      </div>

      <label className="check-row" htmlFor={`${idPrefix}-default`} style={{ marginBottom: 16 }}>
        <input
          type="checkbox"
          id={`${idPrefix}-default`}
          checked={value.isDefault}
          onChange={(e) => onChange({ ...value, isDefault: e.target.checked })}
        />
        <span>{t('setDefaultAddress')}</span>
      </label>

      {footnote && <p className="input-hint" style={{ marginBottom: 14 }}>{footnote}</p>}

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? t('saving') : submitLabel || t('saveAddress')}
      </button>
    </form>
  );
};

export default AddressForm;
