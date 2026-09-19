import { useEffect, useState } from 'react';
import { PackageCheck, SlidersHorizontal, X } from 'lucide-react';
import api from '../../services/api';
import './StockActionModal.css';

/**
 * Restock / adjust-stock modal.
 * Backend contract (verified, catalog.validator.js):
 *  - restock: { quantity: positive integer, reason? (<=255), referenceId? (<=100) }
 *  - adjust:  { quantityChange: non-zero integer (can be negative), reason?, referenceId? }
 * Stock mutations are backend transactions; this form only submits values.
 */
export default function StockActionModal({ mode, product, onClose, onDone }) {
  const isRestock = mode === 'restock';
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [validation, setValidation] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const validate = () => {
    const errors = {};
    const num = Number(quantity);
    if (quantity === '' || !Number.isInteger(num)) {
      errors.quantity = 'Enter a whole number.';
    } else if (isRestock && num <= 0) {
      errors.quantity = 'Restock quantity must be a positive whole number.';
    } else if (!isRestock && num === 0) {
      errors.quantity = 'Adjustment cannot be zero (use a negative value to reduce stock).';
    }
    if (reason.length > 255) errors.reason = 'Reason must be 255 characters or fewer.';
    if (referenceId.length > 100) errors.referenceId = 'Reference must be 100 characters or fewer.';
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
      const payload = { reason: reason.trim() || undefined };
      if (referenceId.trim()) payload.referenceId = referenceId.trim();
      if (isRestock) {
        payload.quantity = Number(quantity);
        await api.post(`/admin/catalog/products/${product.id}/inventory/restock`, payload);
        await onDone(`Restocked "${product.slug}" by ${Number(quantity).toLocaleString('en-UG')} units.`);
      } else {
        payload.quantityChange = Number(quantity);
        await api.post(`/admin/catalog/products/${product.id}/inventory/adjust`, payload);
        await onDone(
          `Adjusted "${product.slug}" stock by ${payload.quantityChange > 0 ? '+' : ''}${payload.quantityChange} units.`,
        );
      }
    } catch (err) {
      setServerError(err.message || 'Stock update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const Icon = isRestock ? PackageCheck : SlidersHorizontal;

  return (
    <div className="stock-modal__overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="stock-modal" role="dialog" aria-modal="true" aria-labelledby="stock-modal-title">
        <div className="stock-modal__header">
          <span className="stock-modal__icon">
            <Icon size={17} aria-hidden="true" />
          </span>
          <h2 id="stock-modal-title">{isRestock ? 'Restock product' : 'Adjust stock'}</h2>
          <button type="button" className="stock-modal__close" onClick={onClose} aria-label="Close dialog">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="stock-modal__product">
          <strong>{product.slug}</strong> — current stock: {product.stockQuantity}
        </p>

        {serverError && (
          <div className="alert alert--error" role="alert" style={{ marginBottom: 12 }}>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="stock-qty" className="required">
              {isRestock ? 'Quantity to add' : 'Quantity change (negative to reduce)'}
            </label>
            <input
              id="stock-qty"
              type="number"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={isRestock ? '50' : '-3'}
              disabled={submitting}
              autoFocus
            />
            {validation.quantity && <span className="field-error">{validation.quantity}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="stock-reason">Reason (optional)</label>
            <input
              id="stock-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isRestock ? 'Weekly farm delivery' : 'Damaged during handling'}
              maxLength={255}
              disabled={submitting}
            />
            {validation.reason && <span className="field-error">{validation.reason}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="stock-ref">Reference ID (optional)</label>
            <input
              id="stock-ref"
              type="text"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="GRN-2026-0042"
              maxLength={100}
              disabled={submitting}
            />
            {validation.referenceId && <span className="field-error">{validation.referenceId}</span>}
          </div>

          <div className="stock-modal__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Applying…' : isRestock ? 'Apply restock' : 'Apply adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
