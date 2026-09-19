import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import { DetailSkeleton } from '../../components/ui/loaders';
import { ErrorState } from '../../components/ui/states';
import './ProductFormPage.css';

/**
 * Product create/edit.
 * Contract (verified against backend validators):
 *  - POST /api/admin/products   { categoryId, slug, priceUgx, stockQuantity?, unit?, sku?, isActive?, translations:[{language,name,description?}] }
 *  - PUT  /api/admin/products/:id  (same, all optional except present fields must be valid)
 *  - slug: lowercase alphanumeric with hyphens; priceUgx integer UGX; quantity >= 0
 *  - languages: en, lg, fr, sw; at least one translation required on create
 * Prices/stock are entered as integers and sent as integers — no client-side
 * financial arithmetic; the backend remains authoritative.
 */

const LANGUAGES = [
  { code: 'en', label: 'English (en)' },
  { code: 'lg', label: 'Luganda (lg)' },
  { code: 'fr', label: 'French (fr)' },
  { code: 'sw', label: 'Kiswahili (sw)' },
];

const EMPTY_FORM = {
  slug: '',
  categoryId: '',
  priceUgx: '',
  stockQuantity: '0',
  unit: 'piece',
  sku: '',
  isActive: true,
  translations: { en: { name: '', description: '' }, lg: { name: '', description: '' }, fr: { name: '', description: '' }, sw: { name: '', description: '' } },
};

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function ProductFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [validation, setValidation] = useState({});
  const [submitting, setSubmitting] = useState(false);

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
      // GET /api/admin/catalog/products?search=<slug> is list-level; the admin API has
      // no single-product endpoint, so pull the list page and locate the row.
      const res = await api.get(`/admin/catalog/products?page=1&limit=100&search=${encodeURIComponent(id)}`);
      const product = (res?.items || []).find((p) => String(p.id) === String(id));
      if (!product) {
        throw new Error('Product not found.');
      }
      const translations = {};
      (product.translations || []).forEach((t) => {
        const key = String(t.language || '').toLowerCase();
        if (key) translations[key] = { name: t.name || '', description: t.description || '' };
      });
      setForm({
        slug: product.slug || '',
        categoryId: product.categoryId != null ? String(product.categoryId) : '',
        priceUgx: product.priceUgx != null ? String(product.priceUgx) : '',
        stockQuantity: product.stockQuantity != null ? String(product.stockQuantity) : '0',
        unit: product.unit || 'piece',
        sku: product.sku || '',
        isActive: Boolean(product.isActive),
        translations: { ...EMPTY_FORM.translations, ...translations },
      });
      setImages(product.images || []);
    } catch (err) {
      setLoadError(err.message || 'Unable to load product.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isEdit) load();
  }, [isEdit, load]);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const setTranslation = (lang, field, value) => {
    setForm((prev) => ({
      ...prev,
      translations: { ...prev.translations, [lang]: { ...prev.translations[lang], [field]: value } },
    }));
  };

  const validate = () => {
    const errors = {};
    if (!form.slug.trim()) errors.slug = 'Slug is required.';
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
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
    const named = LANGUAGES.filter((l) => form.translations[l.code]?.name?.trim());
    if (named.length === 0) {
      errors.translations = 'At least one language name is required.';
    }
    setValidation(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        slug: form.slug.trim(),
        categoryId: Number(form.categoryId),
        priceUgx: Math.round(Number(form.priceUgx)),
        isActive: form.isActive,
        translations: LANGUAGES.filter((l) => form.translations[l.code]?.name?.trim()).map((l) => ({
          language: l.code,
          name: form.translations[l.code].name.trim(),
          description: form.translations[l.code].description?.trim() || undefined,
        })),
      };
      if (form.stockQuantity !== '' && !isEdit) {
        payload.stockQuantity = Math.round(Number(form.stockQuantity));
      }
      if (form.unit.trim()) payload.unit = form.unit.trim();
      if (form.sku.trim()) payload.sku = form.sku.trim();

      if (isEdit) {
        // PUT /api/admin/products/:id
        await api.put(`/admin/catalog/products/${id}`, payload);
        showToast('Product updated successfully.', { type: 'success' });
      } else {
        // POST /api/admin/products
        await api.post('/admin/catalog/products', payload);
        showToast('Product created successfully.', { type: 'success' });
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
          <legend>Basics</legend>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pf-slug" className="required">
                Slug
              </label>
              <input
                id="pf-slug"
                type="text"
                value={form.slug}
                onChange={(e) => setField('slug', slugify(e.target.value))}
                placeholder="fresh-green-matooke"
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
                    {c.slug}
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
              <label htmlFor="pf-unit">Unit</label>
              <input
                id="pf-unit"
                type="text"
                value={form.unit}
                onChange={(e) => setField('unit', e.target.value)}
                placeholder="kg, bunch, crate…"
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
        </fieldset>

        <fieldset>
          <legend>Multilingual content</legend>
          {validation.translations && (
            <div className="alert alert--error" role="alert" style={{ marginBottom: 12 }}>
              <span>{validation.translations}</span>
            </div>
          )}
          {LANGUAGES.map((lang) => (
            <div key={lang.code} className="product-form__lang">
              <div className="product-form__lang-label">{lang.label}</div>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor={`pf-name-${lang.code}`}>Name</label>
                  <input
                    id={`pf-name-${lang.code}`}
                    type="text"
                    value={form.translations[lang.code]?.name || ''}
                    onChange={(e) => setTranslation(lang.code, 'name', e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor={`pf-desc-${lang.code}`}>Description</label>
                  <textarea
                    id={`pf-desc-${lang.code}`}
                    rows={2}
                    value={form.translations[lang.code]?.description || ''}
                    onChange={(e) => setTranslation(lang.code, 'description', e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>
          ))}
        </fieldset>

        {isEdit && images.length > 0 && (
          <fieldset>
            <legend>Images ({images.length})</legend>
            <p className="field-hint">
              Images are managed through the backend image API. Current primary:{' '}
              {images.find((i) => i.isPrimary)?.imageUrl || images[0]?.imageUrl || 'none'}
            </p>
          </fieldset>
        )}

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
    </div>
  );
}
