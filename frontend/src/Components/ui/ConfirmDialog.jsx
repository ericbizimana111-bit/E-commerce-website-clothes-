import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../../Context/LanguageContext';

/**
 * Accessible confirmation modal. Portalled to <body>, closes on Escape or
 * backdrop click, focuses the safe (cancel) action first, and blocks
 * duplicate confirmation while a request is in flight.
 */
const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel
}) => {
  const { t } = useLanguage();
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
        <div className="modal__head">
          <span className={`modal__icon ${danger ? 'modal__icon--danger' : ''}`}>
            <AlertTriangle size={20} aria-hidden="true" />
          </span>
          <h3 id="confirm-title" className="modal__title" style={{ flex: 1 }}>
            {title}
          </h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            disabled={busy}
            aria-label={t('close')}
            style={{ padding: '0 8px' }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p id="confirm-msg" className="modal__message">
          {message}
        </p>
        <div className="modal__actions">
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel || t('cancel')}
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? t('loading') : confirmLabel || t('apply')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
