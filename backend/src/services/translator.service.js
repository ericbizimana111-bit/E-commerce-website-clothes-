const env = require('../config/env');
const logger = require('../utils/logger');
const prisma = require('../config/db');
const { fetchJson, createCache } = require('../utils/http');

/**
 * Automatic translation of catalogue text.
 *
 * Admins write product/category/service names and descriptions in ENGLISH
 * only. This service machine-translates them into the other storefront
 * languages (Luganda, Kiswahili, French) in the background and stores them
 * as `isAuto` translations. English is the source of truth: when it changes,
 * every other language is regenerated. If a provider is unavailable the
 * storefront simply falls back to English (resolveTranslation).
 *
 * Providers (TRANSLATION_PROVIDER):
 *   GOOGLE          Google Cloud Translation v2 (best Luganda support)
 *   LIBRETRANSLATE  self-hosted/hosted LibreTranslate
 *   MYMEMORY        free MyMemory API (default; no key, daily quota)
 *   NONE            disabled (tests)
 */

const TARGET_LANGUAGES = ['LG', 'SW', 'FR'];
const ISO = { EN: 'en', LG: 'lg', SW: 'sw', FR: 'fr' };
const cache = createCache({ max: 5000, ttlMs: 30 * 24 * 3600 * 1000 });

function isEnabled() {
  return env.TRANSLATION_PROVIDER && env.TRANSLATION_PROVIDER !== 'NONE';
}

async function callProvider(text, target) {
  const to = ISO[target];
  switch (env.TRANSLATION_PROVIDER) {
    case 'GOOGLE': {
      if (!env.GOOGLE_TRANSLATE_API_KEY) throw new Error('GOOGLE_TRANSLATE_API_KEY is not set');
      const data = await fetchJson(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: text, source: 'en', target: to, format: 'text' }),
          timeoutMs: 8000,
        }
      );
      return data?.data?.translations?.[0]?.translatedText || null;
    }
    case 'LIBRETRANSLATE': {
      if (!env.LIBRETRANSLATE_URL) throw new Error('LIBRETRANSLATE_URL is not set');
      const data = await fetchJson(`${env.LIBRETRANSLATE_URL.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: 'en', target: to, format: 'text', api_key: env.LIBRETRANSLATE_API_KEY || undefined }),
        timeoutMs: 8000,
      });
      return data?.translatedText || null;
    }
    case 'MYMEMORY': {
      const params = new URLSearchParams({ q: text.slice(0, 480), langpair: `en|${to}` });
      if (env.MYMEMORY_EMAIL) params.set('de', env.MYMEMORY_EMAIL);
      const data = await fetchJson(`https://api.mymemory.translated.net/get?${params}`, { timeoutMs: 8000 });
      const out = data?.responseData?.translatedText;
      if (Number(data?.responseStatus) !== 200 || !out || /MYMEMORY WARNING|INVALID LANGUAGE PAIR|QUERY LENGTH LIMIT/i.test(out)) {
        throw new Error(`MyMemory: ${data?.responseDetails || 'no translation'}`);
      }
      return out;
    }
    default:
      return null;
  }
}

function decodeEntities(text) {
  return String(text)
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** Translate English text to `target` (LG/SW/FR). Returns null on failure. */
async function translateText(text, target) {
  const source = String(text || '').trim();
  if (!source || !isEnabled() || !ISO[target] || target === 'EN') return null;
  const key = `${target}:${source}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  try {
    const raw = await callProvider(source, target);
    const out = raw ? decodeEntities(raw) : null;
    if (out) cache.set(key, out);
    return out;
  } catch (error) {
    logger.warn(`[translate] ${target} failed:`, error.message);
    return null;
  }
}

/** Translate { name, description } into every target language. */
async function translateFields({ name, description }, targets = TARGET_LANGUAGES) {
  const result = {};
  for (const lang of targets) {
    const tName = await translateText(name, lang);
    if (!tName) continue;
    const tDesc = description ? await translateText(description, lang) : null;
    result[lang] = { name: tName.slice(0, 200), description: tDesc || null };
  }
  return result;
}

// ------------------------------------------------------------
// Entity synchronisation (runs in the background, de-duplicated)
// ------------------------------------------------------------
const inFlight = new Set();

function runInBackground(key, fn) {
  if (!isEnabled() || inFlight.has(key)) return;
  inFlight.add(key);
  setImmediate(async () => {
    try {
      await fn();
    } catch (error) {
      logger.warn(`[translate] ${key} failed:`, error.message);
    } finally {
      inFlight.delete(key);
    }
  });
}

/**
 * Generate/refresh machine translations for a product.
 * force=true regenerates every target language (English changed);
 * otherwise only missing languages are filled.
 */
async function syncProductTranslations(productId, { force = false } = {}) {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { translations: true } });
  if (!product) return;
  const en = product.translations.find((t) => t.language === 'EN');
  const name = (en && en.name) || product.nameEn;
  if (!name) return;
  const description = (en && en.description) || product.descriptionEn || null;
  const targets = TARGET_LANGUAGES.filter((lang) => force || !product.translations.some((t) => t.language === lang));
  if (targets.length === 0) return;

  const translated = await translateFields({ name, description }, targets);
  for (const [language, t] of Object.entries(translated)) {
    await prisma.productTranslation.upsert({
      where: { productId_language: { productId, language } },
      update: { name: t.name, description: t.description, isAuto: true },
      create: { productId, language, name: t.name, description: t.description, isAuto: true },
    });
  }
}

async function syncCategoryTranslations(categoryId, { force = false } = {}) {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, include: { translations: true } });
  if (!category) return;
  const en = category.translations.find((t) => t.language === 'EN');
  const name = (en && en.name) || category.nameEn;
  if (!name) return;
  const description = (en && en.description) || null;
  const targets = TARGET_LANGUAGES.filter((lang) => force || !category.translations.some((t) => t.language === lang));
  if (targets.length === 0) return;

  const translated = await translateFields({ name, description }, targets);
  for (const [language, t] of Object.entries(translated)) {
    await prisma.categoryTranslation.upsert({
      where: { categoryId_language: { categoryId, language } },
      update: { name: t.name.slice(0, 100), description: t.description, isAuto: true },
      create: { categoryId, language, name: t.name.slice(0, 100), description: t.description, isAuto: true },
    });
  }
}

async function syncServiceTranslations(serviceId, { force = false } = {}) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return;
  const existing = (service.translations && typeof service.translations === 'object') ? service.translations : {};
  const targets = TARGET_LANGUAGES.filter((lang) => force || !existing[lang]);
  if (targets.length === 0) return;
  const translated = await translateFields({ name: service.nameEn, description: service.descriptionEn }, targets);
  if (Object.keys(translated).length === 0) return;
  await prisma.service.update({
    where: { id: serviceId },
    data: { translations: { ...(force ? {} : existing), ...translated } },
  });
}

const scheduleProduct = (id, opts) => runInBackground(`product:${id}`, () => syncProductTranslations(id, opts));
const scheduleCategory = (id, opts) => runInBackground(`category:${id}`, () => syncCategoryTranslations(id, opts));
const scheduleService = (id, opts) => runInBackground(`service:${id}`, () => syncServiceTranslations(id, opts));

/**
 * Lazy backfill: when a shopper browses in a language an item has no
 * translation for yet, queue it (the shopper sees English meanwhile).
 */
function backfillMissing(kind, items, lang) {
  if (!isEnabled() || !TARGET_LANGUAGES.includes(lang)) return;
  for (const item of (items || []).slice(0, 50)) {
    const has = Array.isArray(item.translations) && item.translations.some((t) => t.language === lang);
    if (has) continue;
    if (kind === 'product') scheduleProduct(item.id);
    if (kind === 'category') scheduleCategory(item.id);
  }
}

module.exports = {
  TARGET_LANGUAGES,
  isEnabled,
  translateText,
  translateFields,
  syncProductTranslations,
  syncCategoryTranslations,
  syncServiceTranslations,
  scheduleProduct,
  scheduleCategory,
  scheduleService,
  backfillMissing,
};
