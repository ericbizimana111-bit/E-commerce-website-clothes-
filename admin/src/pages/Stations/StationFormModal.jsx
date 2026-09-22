import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import api from '../../services/api';
import { DAYS, formatHours, parseHours } from '../../utils/openingHours';
import './StationFormModal.css';

/**
 * Create/edit a pickup station.
 * Backend contract: POST /api/admin/pickup-stations, PUT /api/admin/pickup-stations/:id
 * (name 2-150, district 2-100, addressText 3-300, contactPhone shape-checked,
 * operatingHours 3-100). The backend never charges a pickup fee (pickups are
 * always free at checkout), so the station's pickupFeeUgx column is not
 * exposed here: an editable fee that has no effect would mislead staff.
 *
 * Opening hours are edited as a day range + two times so the stored text is
 * always "Mon - Sat: 8:00 AM - 6:30 PM", the shape the customer site turns
 * into an Open now / Closed badge. Older free-text hours open in "custom"
 * mode with a reminder that no badge can be shown for them.
 */

const LIMITS = { name: 150, district: 100, address: 300, phone: 30, hours: 100 };

// eslint-disable-next-line no-control-regex
const sanitizeLine = (value, max) => String(value).replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s{2,}/g, ' ').slice(0, max);
const sanitizePhone = (value) => String(value).replace(/[^\d+()\s-]/g, '').slice(0, LIMITS.phone);

const DEFAULT_HOURS = { fromDay: 'Mon', toDay: 'Sat', open: '08:00', close: '18:00' };

export default function StationFormModal({ station, onClose, onSaved }) {
  const isEdit = Boolean(station?.id);
  const parsed = isEdit ? parseHours(station.operatingHours) : DEFAULT_HOURS;

  const [name, setName] = useState(station?.name || '');
  const [district, setDistrict] = useState(station?.district || 'Kampala');
  const [addressText, setAddressText] = useState(station?.addressText || '');
  const [contactPhone, setContactPhone] = useState(station?.contactPhone || '');
  const [isActive, setIsActive] = useState(station?.isActive ?? true);
  const [customHours, setCustomHours] = useState(isEdit && !parsed);
  const [hours, setHours] = useState(parsed || DEFAULT_HOURS);
  const [customText, setCustomText] = useState(isEdit && !parsed ? station.operatingHours : '');
  const [validation, setValidation] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  // Prevent body scroll while the modal is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const composedHours = customHours ? customText.trim() : formatHours(hours);

  const validate = () => {
    const errors = {};
    if (name.trim().length < 2) errors.name = 'Enter the station name.';
    if (district.trim().length < 2) errors.district = 'Enter the district.';
    if (addressText.trim().length < 3) errors.addressText = 'Enter the street address or landmark.';
    if (!/^\+?[0-9][0-9 ()-]{5,28}$/.test(contactPhone.trim())) {
      errors.contactPhone = 'Enter a valid phone number, e.g. +256700123456.';
    }
    if (customHours) {
      if (customText.trim().length < 3) errors.hours = 'Enter the opening hours.';
    } else if (!composedHours) {
      errors.hours = 'Closing time must be after opening time.';
    }
    setValidation(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setServerError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        district: district.trim(),
        addressText: addressText.trim(),
        contactPhone: contactPhone.trim(),
        operatingHours: composedHours,
      };
      if (isEdit) {
        await api.put(`/admin/pickup-stations/${station.id}`, payload);
        await onSaved('Station updated successfully.');
      } else {
        await api.post('/admin/pickup-stations', { ...payload, isActive });
        await onSaved('Station created successfully.');
      }
    } catch (err) {
      setServerError(err.message || 'Save failed. Check the form and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const setHoursPart = (key) => (e) => setHours((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="station-modal__overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="station-modal" role="dialog" aria-modal="true" aria-labelledby="station-modal-title">
        <div className="station-modal__header">
          <h2 id="station-modal-title">{isEdit ? 'Edit station' : 'New pickup station'}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="station-modal__close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {serverError && (
          <div className="alert alert--error" role="alert" style={{ marginBottom: 12 }}>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="st-name" className="required">
              Station name
            </label>
            <input
              id="st-name"
              type="text"
              value={name}
              maxLength={LIMITS.name}
              onChange={(e) => setName(sanitizeLine(e.target.value, LIMITS.name))}
              placeholder="Nakasero Market Hub"
              disabled={submitting}
            />
            {validation.name && <span className="field-error">{validation.name}</span>}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="st-district" className="required">
                District
              </label>
              <input
                id="st-district"
                type="text"
                value={district}
                maxLength={LIMITS.district}
                onChange={(e) => setDistrict(sanitizeLine(e.target.value, LIMITS.district))}
                disabled={submitting}
              />
              {validation.district && <span className="field-error">{validation.district}</span>}
            </div>
            <div className="form-field">
              <label htmlFor="st-phone" className="required">
                Contact phone
              </label>
              <input
                id="st-phone"
                type="tel"
                value={contactPhone}
                maxLength={LIMITS.phone}
                onChange={(e) => setContactPhone(sanitizePhone(e.target.value))}
                placeholder="+256700123456"
                disabled={submitting}
              />
              {validation.contactPhone && <span className="field-error">{validation.contactPhone}</span>}
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="st-address" className="required">
              Address / landmark
            </label>
            <input
              id="st-address"
              type="text"
              value={addressText}
              maxLength={LIMITS.address}
              onChange={(e) => setAddressText(sanitizeLine(e.target.value, LIMITS.address))}
              placeholder="Market Street, Central Division, Kampala"
              disabled={submitting}
            />
            {validation.addressText && <span className="field-error">{validation.addressText}</span>}
          </div>

          <fieldset className="station-modal__hours">
            <legend className="required">Opening hours</legend>

            {customHours ? (
              <div className="form-field">
                <label htmlFor="st-hours-text" className="visually-hidden">
                  Opening hours (custom text)
                </label>
                <input
                  id="st-hours-text"
                  type="text"
                  value={customText}
                  maxLength={LIMITS.hours}
                  onChange={(e) => setCustomText(sanitizeLine(e.target.value, LIMITS.hours))}
                  placeholder="Open 24 hours"
                  disabled={submitting}
                />
                <span className="field-hint">
                  Custom text works, but the storefront cannot show an Open now / Closed badge for it.
                </span>
              </div>
            ) : (
              <div className="station-modal__hours-grid">
                <div className="form-field">
                  <label htmlFor="st-from">From</label>
                  <select id="st-from" value={hours.fromDay} onChange={setHoursPart('fromDay')} disabled={submitting}>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="st-to">To</label>
                  <select id="st-to" value={hours.toDay} onChange={setHoursPart('toDay')} disabled={submitting}>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="st-open">Opens</label>
                  <input id="st-open" type="time" value={hours.open} onChange={setHoursPart('open')} disabled={submitting} />
                </div>
                <div className="form-field">
                  <label htmlFor="st-close">Closes</label>
                  <input id="st-close" type="time" value={hours.close} onChange={setHoursPart('close')} disabled={submitting} />
                </div>
              </div>
            )}

            {validation.hours && <span className="field-error">{validation.hours}</span>}
            {!customHours && composedHours && (
              <p className="station-modal__preview">
                Shown to customers as: <strong>{composedHours}</strong>
              </p>
            )}

            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setCustomHours((c) => !c);
                setValidation((v) => ({ ...v, hours: undefined }));
              }}
              disabled={submitting}
            >
              {customHours ? 'Use day and time pickers' : 'Type custom hours instead'}
            </button>
          </fieldset>

          {!isEdit && (
            <div className="form-field station-modal__check">
              <label htmlFor="st-active">
                <input
                  id="st-active"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={submitting}
                />
                Active (visible to customers)
              </label>
            </div>
          )}

          <div className="station-modal__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              <Save size={14} aria-hidden="true" />
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create station'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
