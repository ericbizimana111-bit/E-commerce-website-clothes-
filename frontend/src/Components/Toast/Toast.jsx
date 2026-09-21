import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Check, AlertTriangle, Info, X } from 'lucide-react';
import './Toast.css';

/**
 * UgaMarket — home to home | Lightweight toast system.
 * Accessible: notifications are announced via aria-live, dismissible,
 * auto-expire, and never block the UI. Used for add-to-cart feedback,
 * cart errors, and other short customer messages.
 */

const ToastContext = createContext(null);

let toastIdCounter = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const showToast = useCallback(
    (message, options = {}) => {
      const { type = 'success', duration = 2600 } = options;
      const id = ++toastIdCounter;
      setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
      timersRef.current[id] = setTimeout(() => dismissToast(id), duration);
      return id;
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* Live region announces toasts to screen readers as they appear */}
      <div className="um-toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`um-toast um-toast--${toast.type}`}
            role="status"
          >
            <span className="um-toast-icon" aria-hidden="true">
              {toast.type === 'success' ? <Check size={15} strokeWidth={2.5} /> : toast.type === 'error' ? <AlertTriangle size={15} strokeWidth={1.75} /> : <Info size={15} strokeWidth={1.75} />}
            </span>
            <span className="um-toast-message">{toast.message}</span>
            <button
              type="button"
              className="um-toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
