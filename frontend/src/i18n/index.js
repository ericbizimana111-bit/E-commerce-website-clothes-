import en from './en';
import lg from './lg';
import sw from './sw';
import fr from './fr';

/**
 * Supported storefront languages. `locale` drives number/date formatting
 * (Luganda has no Intl locale, so it formats like English-Uganda).
 * `product` is the language code the backend understands for content.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', locale: 'en-UG' },
  { code: 'lg', name: 'Luganda', native: 'Luganda', locale: 'en-UG' },
  { code: 'sw', name: 'Kiswahili', native: 'Kiswahili', locale: 'sw' },
  { code: 'fr', name: 'French', native: 'Français', locale: 'fr' }
];

export const TRANSLATIONS = { en, lg, sw, fr };

export const DEFAULT_LANGUAGE = 'en';

export const isSupportedLanguage = (code) => Object.prototype.hasOwnProperty.call(TRANSLATIONS, code);

/** Pick the best supported language from a browser's preference list. */
export function detectBrowserLanguage(preferred = []) {
  for (const tag of preferred) {
    const base = String(tag || '').toLowerCase().split('-')[0];
    if (isSupportedLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Translate `key` into `lang`, interpolating {placeholders}.
 * If `params.count` is given and `key_one` / `key_other` exist, the plural
 * form is chosen automatically. Falls back to English, then to the key.
 */
export function translate(lang, key, params) {
  let resolvedKey = key;
  if (params && typeof params.count === 'number') {
    const pluralKey = `${key}_${params.count === 1 ? 'one' : 'other'}`;
    if (en[pluralKey] !== undefined) resolvedKey = pluralKey;
  }

  let text = TRANSLATIONS[lang]?.[resolvedKey];
  if (text === undefined) text = en[resolvedKey];
  if (text === undefined) return key;

  if (params) {
    text = text.replace(/\{(\w+)\}/g, (match, name) =>
      params[name] !== undefined && params[name] !== null ? String(params[name]) : match
    );
  }
  return text;
}

export function localeFor(lang) {
  return SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.locale || 'en-UG';
}
