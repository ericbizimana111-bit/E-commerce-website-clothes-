import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  detectBrowserLanguage,
  isSupportedLanguage,
  localeFor,
  translate
} from '../i18n';

export { SUPPORTED_LANGUAGES };

const LanguageContext = createContext();

const STORAGE_KEY = 'ugamarket_lang';

/** Saved choice wins; otherwise follow the browser; otherwise English. */
function getInitialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isSupportedLanguage(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  if (typeof navigator !== 'undefined') {
    return detectBrowserLanguage(navigator.languages || [navigator.language]);
  }
  return DEFAULT_LANGUAGE;
}

export const LanguageProvider = ({ children }) => {
  const [currentLang, setCurrentLang] = useState(getInitialLanguage);

  // Keep <html lang> in sync so screen readers, hyphenation and browser
  // translation prompts follow the language the customer picked.
  useEffect(() => {
    document.documentElement.lang = currentLang;
  }, [currentLang]);

  const changeLanguage = useCallback((code) => {
    if (!isSupportedLanguage(code)) return;
    setCurrentLang(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* non-fatal */
    }
  }, []);

  const t = useCallback((key, params) => translate(currentLang, key, params), [currentLang]);

  const getLocalizedField = useCallback(
    (item, fieldName) => {
      if (!item) return '';
      if (currentLang !== 'en') {
        const localized = item[`${fieldName}_${currentLang}`];
        if (localized && typeof localized === 'string' && localized.trim()) {
          return localized;
        }
      }
      return item[fieldName] || '';
    },
    [currentLang]
  );

  const formatDateTime = useCallback(
    (value, options) => {
      if (!value) return '—';
      try {
        return new Date(value).toLocaleString(localeFor(currentLang), {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          ...options
        });
      } catch {
        return String(value);
      }
    },
    [currentLang]
  );

  const value = useMemo(
    () => ({
      currentLang,
      changeLanguage,
      t,
      getLocalizedField,
      formatDateTime,
      supportedLanguages: SUPPORTED_LANGUAGES
    }),
    [currentLang, changeLanguage, t, getLocalizedField, formatDateTime]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);
