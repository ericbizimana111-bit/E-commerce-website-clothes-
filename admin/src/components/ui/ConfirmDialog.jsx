import { AlertTriangle, X } from 'lucide-react';
import { useEffect } from 'react';
import './ConfirmDialog.css';

/**
 * Modal confirmation for consequential/destructive operations.
 * Blocks duplicate submission while the confirmed request is in flight.
 */
export default function ConfirmDialog({
  open,
  title = 'Confirm action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="confirm-dialog__header">
          <span className={`confirm-dialog__icon ${danger ? 'confirm-dialog__icon--danger' : ''}`}>
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <h3 id="confirm-title">{title}</h3>
          <button
            type="button"
            className="confirm-dialog__close"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close dialog"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
