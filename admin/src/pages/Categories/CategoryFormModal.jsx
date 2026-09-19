import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import api from '../../services/api';
import './CategoryFormModal.css';

/**
 * Create/edit category modal.
 * Backend contract (verified): slug must be lowercase alphanumeric with
 * hyphens; at least one translation { language, name } is required on create;
 * languages en/lg/fr/sw; displayOrder is a non-negative integer.
 */
const LANGUAGES = [
  { code: 'en', label: 'English (en)' },
  { code: 'lg', label: 'Luganda (lg)' },
  { code: 'fr', label: 'French (fr)' },
  { code: 'sw', label: 'Kiswahili (sw)' },
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function CategoryFormModal({ category, onClose, onSaved }) {
  const isEdit = Boolean(category?.id);
  const [slug, setSlug] = useState(category?.slug || '');
  const [displayOrder, setDisplayOrder] = useState(
    category?.displayOrder != null ? String(category.displayOrder) : '0',
  );
  const [imageUrl, setImageUrl] = useState(category?.imageUrl || '');
  const [translations, setTranslations] = useState(() => {
    const initial = {};
    (category?.translations || []).forEach((t) => {
      const key = String(t.language || '').toLowerCase();
      if (key) initial[key] = { name: t.name || '', description: t.description || '' };
    });
    return initial;
  });
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

  const setTranslation = (lang, field, value) => {
    setTranslations((prev) => ({ ...prev, [lang]: { ...prev[lang], [field]: value } }));
  };

  const validate = () => {
    const errors = {};
    if (!slug.trim()) errors.slug = 'Slug is required.';
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
      errors.slug = 'Lowercase letters/numbers separated by hyphens only.';
    }
    const named = LANGUAGES.filter((l) => translations[l.code]?.name?.trim());
    if (named.length === 0) errors.translations = 'At least one language name is required.';
    const order = Number(displayOrder);
    if (displayOrder !== '' && (!Number.isInteger(order) || order < 0)) {
      errors.displayOrder = 'Display order must be a non-negative integer.';
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
        slug: slug.trim(),
        translations: LANGUAGES.filter((l) => translations[l.code]?.name?.trim()).map((l) => ({
          language: l.code,
          name: translations[l.code].name.trim(),
          description: translations[l.code].description?.trim() || undefined,
        })),
      };
      if (displayOrder !== '') payload.displayOrder = Math.round(Number(displayOrder));
      if (imageUrl.trim()) payload.imageUrl = imageUrl.trim();

      if (isEdit) {
        await api.put(`/admin/categories/${category.id}`, payload);
        await onSaved('Category updated successfully.');
      } else {
        await api.post('/admin/categories', payload);
        await onSaved('Category created successfully.');
      }
    } catch (err) {
      setServerError(err.message || 'Save failed. Check the form and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cat-modal__overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cat-modal" role="dialog" aria-modal="true" aria-labelledby="cat-modal-title">
        <div className="cat-modal__header">
          <h2 id="cat-modal-title">{isEdit ? 'Edit category' : 'New category'}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="cat-modal__close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {serverError && (
          <div className="alert alert--error" role="alert" style={{ marginBottom: 12 }}>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="cat-slug" className="required">
                Slug
              </label>
              <input
                id="cat-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="matooke-tubers"
                disabled={submitting}
              />
              {validation.slug && <span className="field-error">{validation.slug}</span>}
            </div>
            <div className="form-field">
              <label htmlFor="cat-order">Display order</label>
              <input
                id="cat-order"
                type="number"
                min="0"
                step="1"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                disabled={submitting}
              />
              {validation.displayOrder && <span className="field-error">{validation.displayOrder}</span>}
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="cat-image">Image URL (optional)</label>
            <input
              id="cat-image"
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://… or /images/…"
              disabled={submitting}
            />
            <span className="field-hint">
              Absolute http(s) URL or an app-relative /images/ path (backend-validated).
            </span>
          </div>

          <div className="cat-modal__langs">
            {LANGUAGES.map((lang) => (
              <div key={lang.code} className="cat-modal__lang">
                <div className="cat-modal__lang-label">{lang.label}</div>
                <div className="form-field">
                  <label htmlFor={`cat-name-${lang.code}`}>Name</label>
                  <input
                    id={`cat-name-${lang.code}`}
                    type="text"
                    value={translations[lang.code]?.name || ''}
                    onChange={(e) => setTranslation(lang.code, 'name', e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor={`cat-desc-${lang.code}`}>Description (optional)</label>
                  <input
                    id={`cat-desc-${lang.code}`}
                    type="text"
                    value={translations[lang.code]?.description || ''}
                    onChange={(e) => setTranslation(lang.code, 'description', e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
            ))}
            {validation.translations && <span className="field-error">{validation.translations}</span>}
          </div>

          <div className="cat-modal__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              <Save size={14} aria-hidden="true" />
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
