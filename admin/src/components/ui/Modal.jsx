import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './Modal.css';

/**
 * Generic dialog shell: portal, overlay click + Escape to close, scroll lock.
 * Content (forms, actions) is supplied by the caller.
 */
export default function Modal({ open, title, onClose, children, width = 560, busy = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal__overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" style={{ maxWidth: width }}>
        <div className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="modal__close" disabled={busy}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
