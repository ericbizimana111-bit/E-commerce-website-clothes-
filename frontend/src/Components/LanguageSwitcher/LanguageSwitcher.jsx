import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES, useLanguage } from '../../Context/LanguageContext';
import './LanguageSwitcher.css';

/**
 * Switches the whole storefront language instantly (all copy comes from the
 * translation dictionaries, product/category text from the API's `lang`
 * parameter) and remembers the choice.
 *  - variant "menu": compact dropdown for headers
 *  - variant "list": inline options for drawers and the sign-in page
 */
const LanguageSwitcher = ({ variant = 'menu', tone = 'default', onSelect }) => {
  const { currentLang, changeLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const active = SUPPORTED_LANGUAGES.find((l) => l.code === currentLang) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (code) => {
    changeLanguage(code);
    setOpen(false);
    onSelect?.(code);
  };

  if (variant === 'list') {
    return (
      <div className="lang-list" role="group" aria-label={t('selectLanguage')}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            type="button"
            lang={lang.code}
            className={`lang-list__btn ${currentLang === lang.code ? 'lang-list__btn--active' : ''}`}
            aria-pressed={currentLang === lang.code}
            onClick={() => choose(lang.code)}
          >
            {lang.native}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`lang-menu lang-menu--${tone}`} ref={wrapRef}>
      <button
        type="button"
        className="lang-menu__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('selectLanguage')}: ${active.native}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Globe size={15} aria-hidden="true" />
        <span>{active.native}</span>
        <ChevronDown size={13} aria-hidden="true" className={`lang-menu__chev ${open ? 'lang-menu__chev--open' : ''}`} />
      </button>

      {open && (
        <ul className="lang-menu__panel" role="listbox" aria-label={t('selectLanguage')}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <li key={lang.code} role="none">
              <button
                type="button"
                role="option"
                lang={lang.code}
                aria-selected={currentLang === lang.code}
                className={`lang-menu__item ${currentLang === lang.code ? 'lang-menu__item--active' : ''}`}
                onClick={() => choose(lang.code)}
              >
                <span>{lang.native}</span>
                {currentLang === lang.code && <Check size={15} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LanguageSwitcher;
