/**
 * Supported Languages for Uganda Food Marketplace:
 * - EN: English (Default)
 * - LG: Luganda
 * - FR: French
 * - SW: Kiswahili
 */
const SUPPORTED_LANGUAGES = ['EN', 'LG', 'FR', 'SW'];
const DEFAULT_LANGUAGE = 'EN';

/**
 * Normalizes input language string to canonical Language enum
 * e.g., 'en' -> 'EN', 'lg' -> 'LG', 'sw' -> 'SW'
 */
function normalizeLanguage(lang) {
  if (!lang || typeof lang !== 'string') {
    return DEFAULT_LANGUAGE;
  }
  const upper = lang.trim().toUpperCase();
  if (SUPPORTED_LANGUAGES.includes(upper)) {
    return upper;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Resolves translation with deterministic fallback strategy:
 * 1. Requested Language
 * 2. English ('EN')
 * 3. First available translation
 * 4. Fallback defaults
 */
function resolveTranslation(translations = [], requestedLang = DEFAULT_LANGUAGE, fallbackName = '', fallbackDescription = '') {
  const normLang = normalizeLanguage(requestedLang);

  if (!Array.isArray(translations) || translations.length === 0) {
    return {
      language: normLang,
      name: fallbackName,
      description: fallbackDescription,
    };
  }

  // 1. Check for requested language match
  const requested = translations.find((t) => t.language === normLang);
  if (requested && requested.name) {
    return {
      language: requested.language,
      name: requested.name,
      description: requested.description || '',
    };
  }

  // 2. Fallback to English (EN)
  const english = translations.find((t) => t.language === DEFAULT_LANGUAGE);
  if (english && english.name) {
    return {
      language: english.language,
      name: english.name,
      description: english.description || '',
    };
  }

  // 3. Fallback to first available translation
  const first = translations[0];
  if (first && first.name) {
    return {
      language: first.language,
      name: first.name,
      description: first.description || '',
    };
  }

  return {
    language: normLang,
    name: fallbackName,
    description: fallbackDescription,
  };
}

module.exports = {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  resolveTranslation,
};
