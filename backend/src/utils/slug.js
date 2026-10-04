/**
 * URL slug helpers. Slugs are generated from the English name when the admin
 * does not provide one, and made unique with a numeric suffix.
 */

function slugify(value, max = 180) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/** Returns a slug not taken according to `exists(slug) -> Promise<boolean>`. */
async function uniqueSlug(base, exists, max = 180) {
  const root = slugify(base, max) || 'item';
  let candidate = root;
  for (let i = 2; i < 500; i += 1) {
    if (!(await exists(candidate))) return candidate;
    candidate = `${root.slice(0, max - String(i).length - 1)}-${i}`;
  }
  return `${root.slice(0, max - 9)}-${Date.now().toString(36)}`;
}

/**
 * Merge an English name/description given as top-level fields into the
 * translations array (top-level English wins over an EN translation entry).
 */
function mergeEnglish(translations, name, description) {
  const list = Array.isArray(translations) ? translations.map((t) => ({ ...t, language: String(t.language).toUpperCase() })) : [];
  if (!name) return list;
  const rest = list.filter((t) => t.language !== 'EN');
  const prevEn = list.find((t) => t.language === 'EN');
  return [
    {
      language: 'EN',
      name: String(name).trim(),
      description: description !== undefined ? (description ? String(description).trim() : null) : prevEn ? prevEn.description : null,
    },
    ...rest,
  ];
}

module.exports = { slugify, uniqueSlug, mergeEnglish };
