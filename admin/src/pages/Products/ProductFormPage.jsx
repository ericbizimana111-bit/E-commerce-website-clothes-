import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Languages, Plus, RefreshCw, Save, Star, Trash2, X } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ImageDropzone from '../../components/ui/ImageDropzone';
import { validateImageFile } from '../../utils/imageFiles';
import { DetailSkeleton } from '../../components/ui/loaders';
import { ErrorState } from '../../components/ui/states';
import './ProductFormPage.css';

/**
 * Product create/edit (general merchandise: food, phones, fashion, home...).
 * Contract (backend validators/routes):
 *  - POST /api/admin/catalog/products  { categoryId, name, description?, priceUgx, stockQuantity?, unit?,
 *                                         sku?, brand?, compareAtPriceUgx?, isFeatured?, specifications?, slug? }
 *  - PUT  /api/admin/catalog/products/:id (partial update)
 *  - POST /api/admin/catalog/products/:id/translate (regenerate machine translations)
 *  - image endpoints unchanged (multipart upload, primary, delete)
 * Admins write ENGLISH only: Luganda, Kiswahili and French are generated
 * automatically by the backend and refreshed whenever the English changes.
 * Stock on edit is not editable here: inventory restock/adjust owns it.
 */

const AUTO_LANGS = [
  { code: 'LG', label: 'Luganda' },
  { code: 'SW', label: 'Kiswahili' },
  { code: 'FR', label: 'French' },
];

const EMPTY_FORM = {
  name: '',
  description: '',
  slug: '',
  categoryId: '',
  priceUgx: '',
  compareAtPriceUgx: '',
  stockQuantity: '0',
  unit: 'piece',
  sku: '',
  brand: '',
  isFeatured: false,
  isActive: true,
  specifications: [],
};

const PLACEHOLDER = '/img-placeholder.svg';

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Input-time normalization: lowercase and map invalid characters to hyphens,
 * but PRESERVE trailing hyphens so admins can type "fresh-" while composing
 * "fresh-matooke" (slugify's trailing strip made hyphens untypable).
 * The strict slug form is produced by slugify() on submit.
 */
function normalizeSlugInput(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-');
}

export default function ProductFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState([]);
  // Pending image picked on CREATE (uploaded right after the product exists)
  const [pendingImage, setPendingImage] = useState(null); // { file, previewUrl }
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // { current, total }
  const [removeTarget, setRemoveTarget] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [validation, setValidation] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [translations, setTranslations] = useState([]);
  const [retranslating, setRetranslating] = useState(false);

  useEffect(() => {
    api
      .get('/admin/catalog/categories?page=1&limit=100')
      .then((res) => setCategories(Array.isArray(res?.items) ? res.items : []))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // GET /api/admin/catalog/products/:id — single-product admin endpoint.
      const res = await api.get(`/admin/catalog/products/${id}`);
      const product = res?.data;
      if (!product) {
        throw new Error('Product not found.');
      }
      const en = (product.translations || []).find((t) => t.language === 'EN');
      setTranslations(product.translations || []);
      setForm({
        name: en?.name || product.nameEn || '',
        description: en?.description || product.descriptionEn || '',
        slug: product.slug || '',
        categoryId: product.categoryId != null ? String(product.categoryId) : '',
        priceUgx: product.priceUgx != null ? String(product.priceUgx) : '',
        compareAtPriceUgx: product.compareAtPriceUgx != null ? String(product.compareAtPriceUgx) : '',
        stockQuantity: product.stockQuantity != null ? String(product.stockQuantity) : '0',
        unit: product.unit || 'piece',
        sku: product.sku || '',
        brand: product.brand || '',
        isFeatured: Boolean(product.isFeatured),
        isActive: Boolean(product.isActive),
        specifications: Array.isArray(product.specifications) ? product.specifications : [],
      });
      setImages(Array.isArray(product.images) ? product.images : []);
    } catch (err) {
      setLoadError(err.message || 'Unable to load product.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isEdit) load();
  }, [isEdit, load]);

  // Revoke object URLs for the pending preview when it changes/unmounts.
  useEffect(() => {
    return () => {
      if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    };
  }, [pendingImage]);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const setSpec = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      specifications: prev.specifications.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  };

  const regenerateTranslations = async () => {
    setRetranslating(true);
    try {
      const res = await api.post(`/admin/catalog/products/${id}/translate`);
      setTranslations(res?.data?.translations || []);
      showToast('Translations regenerated from the English text.', { type: 'success' });
    } catch (err) {
      showToast(err.message || 'Could not regenerate translations.', { type: 'error' });
    } finally {
      setRetranslating(false);
    }
  };

  const validate = () => {
    const errors = {};
    if (form.name.trim().length < 2) errors.name = 'Enter the product name in English.';
    const finalSlug = slugify(form.slug.trim());
    if (form.slug.trim() && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(finalSlug)) {
      errors.slug = 'Slug must be lowercase letters/numbers separated by hyphens.';
    }
    if (!form.categoryId) errors.categoryId = 'Select a category.';
    const price = Number(form.priceUgx);
    if (form.priceUgx === '' || !Number.isFinite(price) || !Number.isInteger(price) || price < 0) {
      errors.priceUgx = 'Price must be a non-negative integer (UGX).';
    }
    const stock = Number(form.stockQuantity);
    if (form.stockQuantity !== '' && (!Number.isInteger(stock) || stock < 0)) {
      errors.stockQuantity = 'Stock must be a non-negative integer.';
    }
    if (form.compareAtPriceUgx !== '') {
      const was = Number(form.compareAtPriceUgx);
      if (!Number.isInteger(was) || was <= price) errors.compareAtPriceUgx = 'The "was" price must be a whole number higher than the price.';
    }
    if (form.specifications.some((s) => !s.label?.trim() || !s.value?.trim())) {
      errors.specifications = 'Fill in or remove empty specification rows.';
    }
    setValidation(errors);
    return Object.keys(errors).length === 0;
  };

  /** Re-fetch only the image list so unsaved edits in the rest of the form are kept. */
  const refreshImages = async () => {
    const res = await api.get(`/admin/catalog/products/${id}`);
    setImages(Array.isArray(res?.data?.images) ? res.data.images : []);
  };

  /** Entry point for both the file picker and drag-and-drop. */
  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const problems = [];
    const valid = [];
    files.forEach((file) => {
      const problem = validateImageFile(file);
      if (problem) problems.push(problem);
      else valid.push(file);
    });

    if (!isEdit && valid.length > 1) {
      problems.push('Only one image can be attached while creating. Add more after saving the product.');
    }
    setImageError(problems.length ? problems.join(' ') : null);
    if (valid.length === 0) return;

    if (isEdit) {
      uploadImages(valid);
    } else {
      setPendingImage({ file: valid[0], previewUrl: URL.createObjectURL(valid[0]) });
    }
  };

  /** Upload files one at a time (multipart POST) to an existing or newly created product. */
  const uploadImages = async (files, productId = id) => {
    setImageBusy(true);
    setImageError(null);
    let uploaded = 0;
    const failures = [];
    for (let i = 0; i < files.length; i += 1) {
      setUploadProgress({ current: i + 1, total: files.length });
      try {
        const data = new FormData();
        data.append('image', files[i]);
        await api.post(`/admin/catalog/products/${productId}/images`, data);
        uploaded += 1;
      } catch (err) {
        failures.push(`${files[i].name}: ${err.message || 'upload failed.'}`);
      }
    }
    setUploadProgress(null);

    if (uploaded > 0) {
      showToast(uploaded === 1 ? 'Image uploaded.' : `${uploaded} images uploaded.`, { type: 'success' });
      if (String(productId) === String(id)) {
        try {
          await refreshImages();
        } catch (err) {
          failures.push(err.message || 'Could not refresh the image list.');
        }
      }
    }
    if (failures.length > 0) {
      setImageError(failures.join(' '));
      showToast(failures[0], { type: 'error' });
    }
    setImageBusy(false);
    return failures.length === 0;
  };

  /** Remove an image (edit mode). Backend deletes the row; file cleanup is reference-checked server-side. */
  const removeImage = async (image) => {
    setImageBusy(true);
    setImageError(null);
    try {
      await api.delete(`/admin/catalog/products/${id}/images/${image.id}`);
      showToast('Image removed.', { type: 'success' });
      await refreshImages();
    } catch (err) {
      setImageError(err.message || 'Failed to remove image.');
      showToast(err.message || 'Failed to remove image.', { type: 'error' });
    } finally {
      setImageBusy(false);
      setRemoveTarget(null);
    }
  };

  /** Make an image primary by re-sending the full ordered set (existing PUT endpoint). */
  const makePrimary = async (image) => {
    setImageBusy(true);
    setImageError(null);
    try {
      const ordered = [
        { imageUrl: image.imageUrl, altText: image.altText || undefined, isPrimary: true, sortOrder: 0 },
        ...images
          .filter((img) => img.id !== image.id)
          .map((img, index) => ({
            imageUrl: img.imageUrl,
            altText: img.altText || undefined,
            isPrimary: false,
            sortOrder: index + 1,
          })),
      ];
      await api.put(`/admin/catalog/products/${id}/images`, { images: ordered });
      showToast('Primary image updated.', { type: 'success' });
      await refreshImages();
    } catch (err) {
      setImageError(err.message || 'Failed to update the primary image.');
      showToast(err.message || 'Failed to update the primary image.', { type: 'error' });
    } finally {
      setImageBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        categoryId: Number(form.categoryId),
        priceUgx: Math.round(Number(form.priceUgx)),
        compareAtPriceUgx: form.compareAtPriceUgx === '' ? null : Math.round(Number(form.compareAtPriceUgx)),
        brand: form.brand.trim() || null,
        isFeatured: form.isFeatured,
        isActive: form.isActive,
        specifications: form.specifications.map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
      };
      if (form.slug.trim()) payload.slug = slugify(form.slug.trim());
      if (form.stockQuantity !== '' && !isEdit) {
        payload.stockQuantity = Math.round(Number(form.stockQuantity));
      }
      if (form.unit.trim()) payload.unit = form.unit.trim();
      // Send sku explicitly (null allowed) so admins can also CLEAR a SKU.
      payload.sku = form.sku.trim() || null;

      let createdId = null;
      if (isEdit) {
        // PUT /api/admin/catalog/products/:id — partial update; untouched fields are preserved server-side.
        await api.put(`/admin/catalog/products/${id}`, payload);
        showToast('Product updated successfully.', { type: 'success' });
      } else {
        // POST /api/admin/catalog/products
        const res = await api.post('/admin/catalog/products', payload);
        createdId = res?.data?.id || null;
        showToast('Product created successfully.', { type: 'success' });
      }

      // Upload the image chosen during CREATE now that the product exists.
      if (!isEdit && pendingImage?.file) {
        if (createdId) {
          const ok = await uploadImages([pendingImage.file], createdId);
          if (!ok) {
            // Product exists but the image failed: open it so the upload can be retried.
            navigate(`/products/${createdId}`);
            return;
          }
        } else {
          setImageError('Product was created but its ID was missing from the response; the image was not uploaded.');
        }
      }

      navigate('/products');
    } catch (err) {
      showToast(err.message || 'Save failed. Check the form and try again.', { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <DetailSkeleton />;
  }

  if (loadError) {
    return (
      <div>
        <Link to="/products" className="product-form__back">
          Back to products
        </Link>
        <ErrorState message={loadError} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="product-form">
      <Link to="/products" className="product-form__back">
        Back to products
      </Link>
      <h1>{isEdit ? `Edit product` : 'New product'}</h1>

      <form onSubmit={handleSubmit} noValidate className="product-form__body panel panel-pad">
        <fieldset>
          <legend>Product details (English)</legend>
          <div className="form-field">
            <label htmlFor="pf-name" className="required">
              Product name
            </label>
            <input
              id="pf-name"
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Samsung Galaxy A15 (128 GB)"
              disabled={submitting}
            />
            {validation.name && <span className="field-error">{validation.name}</span>}
          </div>
          <div className="form-field">
            <label htmlFor="pf-desc">Description</label>
            <textarea
              id="pf-desc"
              rows={4}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="What it is, key features, what's in the box…"
              disabled={submitting}
            />
            <span className="field-hint">
              <Languages size={12} aria-hidden="true" /> Write in English only — Luganda, Kiswahili and French are translated automatically.
            </span>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pf-slug">URL slug (optional)</label>
              <input
                id="pf-slug"
                type="text"
                value={form.slug}
                onChange={(e) => setField('slug', normalizeSlugInput(e.target.value))}
                placeholder={slugify(form.name) || 'generated from the name'}
                disabled={submitting}
              />
              {validation.slug && <span className="field-error">{validation.slug}</span>}
            </div>
            <div className="form-field">
              <label htmlFor="pf-category" className="required">
                Category
              </label>
              <select
                id="pf-category"
                value={form.categoryId}
                onChange={(e) => setField('categoryId', e.target.value)}
                disabled={submitting}
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.translations || []).find((t) => t.language === 'EN')?.name || c.nameEn || c.slug}
                  </option>
                ))}
              </select>
              {validation.categoryId && <span className="field-error">{validation.categoryId}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pf-price" className="required">
                Price (UGX, integer)
              </label>
              <input
                id="pf-price"
                type="number"
                min="0"
                step="1"
                value={form.priceUgx}
                onChange={(e) => setField('priceUgx', e.target.value)}
                placeholder="28000"
                disabled={submitting}
              />
              {validation.priceUgx && <span className="field-error">{validation.priceUgx}</span>}
            </div>
            <div className="form-field">
              <label htmlFor="pf-stock">Initial stock (create only)</label>
              <input
                id="pf-stock"
                type="number"
                min="0"
                step="1"
                value={form.stockQuantity}
                onChange={(e) => setField('stockQuantity', e.target.value)}
                disabled={submitting || isEdit}
              />
              {isEdit && (
                <span className="field-hint">
                  Use Inventory restock/adjust to change stock — this form cannot bypass it.
                </span>
              )}
              {validation.stockQuantity && <span className="field-error">{validation.stockQuantity}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pf-was">“Was” price (UGX, optional)</label>
              <input
                id="pf-was"
                type="number"
                min="0"
                step="1"
                value={form.compareAtPriceUgx}
                onChange={(e) => setField('compareAtPriceUgx', e.target.value)}
                placeholder="Shown struck-through for deals"
                disabled={submitting}
              />
              {validation.compareAtPriceUgx && <span className="field-error">{validation.compareAtPriceUgx}</span>}
            </div>
            <div className="form-field">
              <label htmlFor="pf-brand">Brand</label>
              <input
                id="pf-brand"
                type="text"
                value={form.brand}
                onChange={(e) => setField('brand', e.target.value.slice(0, 100))}
                placeholder="e.g. Tecno, Samsung, Hisense"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pf-unit">Unit</label>
              <input
                id="pf-unit"
                type="text"
                value={form.unit}
                onChange={(e) => setField('unit', e.target.value)}
                placeholder="piece, kg, pair, pack, bunch…"
                disabled={submitting}
              />
            </div>
            <div className="form-field">
              <label htmlFor="pf-sku">SKU (optional)</label>
              <input
                id="pf-sku"
                type="text"
                value={form.sku}
                onChange={(e) => setField('sku', e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-field product-form__check">
            <input
              id="pf-active"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField('isActive', e.target.checked)}
              disabled={submitting}
            />
            <label htmlFor="pf-active" style={{ fontWeight: 600 }}>
              Active (visible to customers)
            </label>
          </div>
          <div className="form-field product-form__check">
            <input
              id="pf-featured"
              type="checkbox"
              checked={form.isFeatured}
              onChange={(e) => setField('isFeatured', e.target.checked)}
              disabled={submitting}
            />
            <label htmlFor="pf-featured" style={{ fontWeight: 600 }}>
              Featured on the home page
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Specifications</legend>
          <p className="field-hint product-form__hint">Key facts shown in a table on the product page (e.g. Storage: 128 GB, Size: XL, Weight: 2 kg).</p>
          {form.specifications.map((s, i) => (
            <div key={i} className="spec-row">
              <input type="text" value={s.label} onChange={(e) => setSpec(i, 'label', e.target.value.slice(0, 60))} placeholder="Label" aria-label={`Specification ${i + 1} label`} disabled={submitting} />
              <input type="text" value={s.value} onChange={(e) => setSpec(i, 'value', e.target.value.slice(0, 200))} placeholder="Value" aria-label={`Specification ${i + 1} value`} disabled={submitting} />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setField('specifications', form.specifications.filter((_, j) => j !== i))}
                aria-label={`Remove specification ${i + 1}`}
                disabled={submitting}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
          {validation.specifications && <span className="field-error">{validation.specifications}</span>}
          {form.specifications.length < 30 && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setField('specifications', [...form.specifications, { label: '', value: '' }])}
              disabled={submitting}
            >
              <Plus size={13} aria-hidden="true" /> Add specification
            </button>
          )}
        </fieldset>

        {isEdit && (
          <fieldset>
            <legend>Automatic translations</legend>
            <p className="field-hint product-form__hint">
              Generated from the English name and description and refreshed whenever you change them. Customers who pick another language see these.
            </p>
            <div className="auto-trans-grid">
              {AUTO_LANGS.map((l) => {
                const tr = translations.find((t) => t.language === l.code);
                return (
                  <div key={l.code} className="auto-trans-card">
                    <span className="auto-trans-card__lang">
                      {l.label} {tr?.isAuto && <span className="badge badge--info">auto</span>}
                    </span>
                    <strong>{tr?.name || <em className="text-muted">Pending…</em>}</strong>
                    {tr?.description && <p>{tr.description}</p>}
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn btn--secondary btn--sm" onClick={regenerateTranslations} disabled={retranslating || submitting}>
              <RefreshCw size={13} aria-hidden="true" /> {retranslating ? 'Translating…' : 'Regenerate translations'}
            </button>
          </fieldset>
        )}

        <fieldset>
          <legend>Images</legend>
          <p className="field-hint product-form__hint">
            {isEdit
              ? 'Uploads are added to this product straight away. The primary image is what customers see first.'
              : 'Attach an image now and it is uploaded right after the product is created. You can add more once it is saved.'}
          </p>

          {imageError && (
            <div className="alert alert--error" role="alert" style={{ marginBottom: 14 }}>
              <span>{imageError}</span>
            </div>
          )}

          <ImageDropzone
            id="pf-image"
            inputLabel="Choose product image"
            multiple={isEdit}
            disabled={imageBusy || submitting}
            progressText={uploadProgress ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…` : null}
            idleText={
              isEdit
                ? 'Drag and drop images here, or click to browse'
                : 'Drag and drop an image here, or click to browse'
            }
            onFiles={handleFiles}
          />

          {((isEdit && images.length > 0) || (!isEdit && pendingImage)) && (
            <div className="product-form__images">
              {(isEdit ? images : []).map((img) => (
                <div key={img.id} className="product-form__image-card">
                  <div className="product-form__image-frame">
                    <img
                      src={img.imageUrl}
                      alt={img.altText || 'Product image'}
                      className="product-form__image-thumb"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = PLACEHOLDER;
                      }}
                    />
                    {img.isPrimary && (
                      <span className="product-form__image-primary" title="Primary image">
                        <Star size={11} aria-hidden="true" /> Primary
                      </span>
                    )}
                  </div>
                  <div className="product-form__image-actions">
                    {!img.isPrimary && (
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => makePrimary(img)}
                        disabled={imageBusy || submitting}
                        aria-label={`Set image ${img.id} as primary`}
                      >
                        <Star size={13} aria-hidden="true" />
                        Set primary
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm product-form__image-remove"
                      onClick={() => setRemoveTarget(img)}
                      disabled={imageBusy || submitting}
                      aria-label={`Remove image ${img.id}`}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {!isEdit && pendingImage && (
                <div className="product-form__image-card">
                  <div className="product-form__image-frame">
                    <img
                      src={pendingImage.previewUrl}
                      alt="Selected product image preview"
                      className="product-form__image-thumb"
                    />
                    <span className="product-form__image-primary" title="Will be the primary image">
                      <Star size={11} aria-hidden="true" /> Primary
                    </span>
                  </div>
                  <p className="product-form__image-name" title={pendingImage.file.name}>
                    {pendingImage.file.name}
                  </p>
                  <div className="product-form__image-actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm product-form__image-remove"
                      onClick={() => setPendingImage(null)}
                      disabled={submitting}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </fieldset>

        <div className="product-form__actions">
          <Link to="/products" className="btn btn--secondary">
            Cancel
          </Link>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            <Save size={14} aria-hidden="true" />
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove this image?"
        message="The image will be removed from this product. Customers will no longer see it."
        confirmLabel="Remove image"
        danger
        busy={imageBusy}
        onConfirm={() => removeImage(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
