import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, AlertTriangle, Info, X } from 'lucide-react';
import { useLanguage } from '../../Context/LanguageContext';
import './Toast.css';

/**
 * Lightweight toast system. Notifications are announced through an
 * aria-live region, are dismissible, expire on their own and never block
 * the page. Used for add-to-cart feedback and short customer messages.
 */
const ToastContext = createContext(null);

let toastIdCounter = 0;

export const ToastProvider = ({ children }) => {
  const { t } = useLanguage();
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const showToast = useCallback(
    (message, options = {}) => {
      const { type = 'success', duration = 3000 } = options;
      const id = ++toastIdCounter;
      setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
      timersRef.current[id] = setTimeout(() => dismissToast(id), duration);
      return id;
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const iconFor = (type) => {
    if (type === 'success') return <Check size={16} strokeWidth={2.5} />;
    if (type === 'error') return <AlertTriangle size={16} strokeWidth={2} />;
    return <Info size={16} strokeWidth={2} />;
  };

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="um-toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`um-toast um-toast--${toast.type}`} role="status">
            <span className="um-toast-icon" aria-hidden="true">
              {iconFor(toast.type)}
            </span>
            <span className="um-toast-message">{toast.message}</span>
            <button type="button" className="um-toast-close" onClick={() => dismissToast(toast.id)} aria-label={t('dismiss')}>
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
