import { useEffect, useState } from 'react';
import { Languages, Save, Trash2, X } from 'lucide-react';
import api from '../../services/api';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import IconPicker from '../../components/ui/IconPicker';
import ImageDropzone from '../../components/ui/ImageDropzone';
import { validateImageFile } from '../../utils/imageFiles';
import './CategoryFormModal.css';

/**
 * Create/edit category modal.
 * Admins write the ENGLISH name/description only; the backend translates them
 * into Luganda, Kiswahili and French automatically. Slug is optional
 * (generated from the name); icon is shown in the storefront menus.
 */
const AUTO_LANGS = [
  { code: 'LG', label: 'Luganda' },
  { code: 'SW', label: 'Kiswahili' },
  { code: 'FR', label: 'French' },
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Input-time normalization: preserve trailing hyphens so admins can type
 * "fresh-" while composing "fresh-fruits". The strict slug is produced by
 * slugify() on submit.
 */
function normalizeSlugInput(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-');
}

export default function CategoryFormModal({ category, onClose, onSaved, onImageChanged }) {
  const isEdit = Boolean(category?.id);
  const [slug, setSlug] = useState(category?.slug || '');
  const [displayOrder, setDisplayOrder] = useState(
    category?.displayOrder != null ? String(category.displayOrder) : '0',
  );
  const [imageUrl, setImageUrl] = useState(category?.imageUrl || '');
  // Image picked while CREATING: uploaded right after the category exists.
  const [pendingImage, setPendingImage] = useState(null); // { file, previewUrl }
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const english = (category?.translations || []).find((t) => t.language === 'EN');
  const [name, setName] = useState(english?.name || category?.nameEn || '');
  const [description, setDescription] = useState(english?.description || '');
  const [icon, setIcon] = useState(category?.icon || '');
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

  // Release the object URL of a discarded / replaced preview.
  useEffect(() => {
    return () => {
      if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    };
  }, [pendingImage]);

  /** POST /api/admin/catalog/categories/:id/image (multipart "image"). */
  const uploadImage = async (file, categoryId) => {
    const data = new FormData();
    data.append('image', file);
    const res = await api.post(`/admin/catalog/categories/${categoryId}/image`, data);
    return res?.data?.imageUrl || '';
  };

  const handleImageFiles = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    const problem = validateImageFile(file);
    setImageError(problem);
    if (problem) return;

    if (!isEdit) {
      setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
      return;
    }
    setImageBusy(true);
    try {
      setImageUrl(await uploadImage(file, category.id));
      onImageChanged?.();
    } catch (err) {
      setImageError(err.message || 'Image upload failed.');
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = async () => {
    setImageBusy(true);
    setImageError(null);
    try {
      await api.delete(`/admin/catalog/categories/${category.id}/image`);
      setImageUrl('');
      onImageChanged?.();
    } catch (err) {
      setImageError(err.message || 'Failed to remove the image.');
    } finally {
      setImageBusy(false);
      setConfirmRemove(false);
    }
  };

  const validate = () => {
    const errors = {};
    if (name.trim().length < 2) errors.name = 'Enter the category name in English.';
    const finalSlug = slugify(slug.trim());
    if (slug.trim() && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(finalSlug)) {
      errors.slug = 'Lowercase letters/numbers separated by hyphens only.';
    }
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
        name: name.trim(),
        description: description.trim() || null,
        icon: icon || null,
      };
      if (slug.trim()) payload.slug = slugify(slug.trim());
      if (displayOrder !== '') payload.displayOrder = Math.round(Number(displayOrder));

      if (isEdit) {
        await api.put(`/admin/catalog/categories/${category.id}`, payload);
        await onSaved('Category updated successfully.');
      } else {
        const res = await api.post('/admin/catalog/categories', payload);
        const createdId = res?.data?.id;
        if (pendingImage?.file && createdId) {
          try {
            await uploadImage(pendingImage.file, createdId);
          } catch (err) {
            await onSaved(
              `Category created, but the image could not be uploaded (${err.message || 'upload failed'}). Edit the category to try again.`,
            );
            return;
          }
        }
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
          <div className="form-field">
            <label htmlFor="cat-name" className="required">
              Category name (English)
            </label>
            <input id="cat-name" type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 100))} placeholder="e.g. Phones & Tablets" disabled={submitting} />
            {validation.name && <span className="field-error">{validation.name}</span>}
          </div>
          <div className="form-field">
            <label htmlFor="cat-desc">Description (English, optional)</label>
            <input id="cat-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} disabled={submitting} />
            <span className="field-hint">
              <Languages size={12} aria-hidden="true" /> Luganda, Kiswahili and French are translated automatically.
            </span>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="cat-slug">URL slug (optional)</label>
              <input
                id="cat-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(normalizeSlugInput(e.target.value))}
                placeholder={slugify(name) || 'generated from the name'}
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

          <fieldset className="cat-modal__image">
            <legend>Image</legend>
            {imageError && (
              <div className="alert alert--error" role="alert" style={{ marginBottom: 10 }}>
                <span>{imageError}</span>
              </div>
            )}

            {(isEdit ? imageUrl : pendingImage?.previewUrl) && (
              <div className="cat-modal__preview">
                <img
                  src={isEdit ? imageUrl : pendingImage.previewUrl}
                  alt="Category"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/img-placeholder.svg';
                  }}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm cat-modal__remove"
                  onClick={() => (isEdit ? setConfirmRemove(true) : setPendingImage(null))}
                  disabled={imageBusy || submitting}
                >
                  <Trash2 size={13} aria-hidden="true" />
                  {isEdit ? 'Remove' : 'Discard'}
                </button>
              </div>
            )}

            <ImageDropzone
              id="cat-image"
              inputLabel="Choose category image"
              disabled={imageBusy || submitting}
              progressText={imageBusy ? 'Uploading…' : null}
              idleText={
                (isEdit ? imageUrl : pendingImage)
                  ? 'Drag a new image here to replace it, or click to browse'
                  : 'Drag and drop an image here, or click to browse'
              }
              hint={
                isEdit
                  ? 'JPEG, PNG, WebP or GIF · up to 5 MB · uploaded immediately'
                  : 'JPEG, PNG, WebP or GIF · up to 5 MB · uploaded when the category is created'
              }
              onFiles={handleImageFiles}
            />
          </fieldset>

          <div className="form-field">
            <label>Menu icon</label>
            <IconPicker value={icon} onChange={setIcon} disabled={submitting} />
          </div>

          {isEdit && (
            <div className="cat-modal__langs">
              {AUTO_LANGS.map((lang) => {
                const tr = (category.translations || []).find((t) => t.language === lang.code);
                return (
                  <div key={lang.code} className="cat-modal__lang">
                    <div className="cat-modal__lang-label">
                      {lang.label} {tr?.isAuto ? '· automatic' : ''}
                    </div>
                    <span>{tr?.name || 'Pending translation…'}</span>
                  </div>
                );
              })}
            </div>
          )}

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

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this image?"
        message="The category will show the placeholder picture on the storefront until a new image is uploaded."
        confirmLabel="Remove image"
        danger
        busy={imageBusy}
        onConfirm={removeImage}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
