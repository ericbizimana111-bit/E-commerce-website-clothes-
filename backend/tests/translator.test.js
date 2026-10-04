/**
 * Automatic translation service (network mocked). Verifies provider calls,
 * HTML-entity decoding, failure fallback and that English edits regenerate
 * the other languages for a product.
 */
const prisma = require('../src/config/db');

jest.setTimeout(30000);

describe('translator.service', () => {
  let translator;
  let realFetch;
  const env = require('../src/config/env');
  const original = env.TRANSLATION_PROVIDER;
  const createdProductIds = [];

  beforeAll(() => {
    realFetch = global.fetch;
    env.TRANSLATION_PROVIDER = 'MYMEMORY';
    translator = require('../src/services/translator.service');
  });

  afterAll(async () => {
    env.TRANSLATION_PROVIDER = original;
    global.fetch = realFetch;
    for (const id of createdProductIds) {
      await prisma.productTranslation.deleteMany({ where: { productId: id } });
      await prisma.product.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  function mockMyMemory(map) {
    global.fetch = jest.fn(async (url) => {
      const u = new URL(url);
      const q = u.searchParams.get('q');
      const target = u.searchParams.get('langpair').split('|')[1];
      const out = map(q, target);
      if (out === null) return new Response(JSON.stringify({ responseStatus: 429, responseDetails: 'quota' }), { status: 200 });
      return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: out } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  }

  test('translates via provider and decodes HTML entities', async () => {
    mockMyMemory((q, t) => `${t.toUpperCase()}: ${q} &amp; more`);
    const out = await translator.translateText('Soap', 'SW');
    expect(out).toBe('SW: Soap & more');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // cached: second call does not hit the network
    await translator.translateText('Soap', 'SW');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('provider failure returns null (storefront falls back to English)', async () => {
    mockMyMemory(() => null);
    expect(await translator.translateText('Unique failing text', 'LG')).toBeNull();
  });

  test('English is never "translated" and empty text is ignored', async () => {
    mockMyMemory((q) => q);
    expect(await translator.translateText('Hello', 'EN')).toBeNull();
    expect(await translator.translateText('   ', 'FR')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('syncProductTranslations creates auto translations and regenerates on English change', async () => {
    const category = await prisma.category.findFirst();
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'translate-test-' + Date.now(),
        priceUgx: 1000,
        nameEn: 'Blue Bucket',
        translations: { create: [{ language: 'EN', name: 'Blue Bucket' }] },
      },
    });
    createdProductIds.push(product.id);

    mockMyMemory((q, t) => `[${t}] ${q}`);
    await translator.syncProductTranslations(product.id);
    let rows = await prisma.productTranslation.findMany({ where: { productId: product.id } });
    expect(rows.find((r) => r.language === 'LG')).toMatchObject({ name: '[lg] Blue Bucket', isAuto: true });
    expect(rows.find((r) => r.language === 'FR').name).toBe('[fr] Blue Bucket');
    expect(rows.find((r) => r.language === 'SW').name).toBe('[sw] Blue Bucket');

    await prisma.productTranslation.update({ where: { productId_language: { productId: product.id, language: 'EN' } }, data: { name: 'Red Bucket' } });
    await translator.syncProductTranslations(product.id); // not forced: nothing missing -> unchanged
    rows = await prisma.productTranslation.findMany({ where: { productId: product.id } });
    expect(rows.find((r) => r.language === 'LG').name).toBe('[lg] Blue Bucket');

    await translator.syncProductTranslations(product.id, { force: true });
    rows = await prisma.productTranslation.findMany({ where: { productId: product.id } });
    expect(rows.find((r) => r.language === 'LG').name).toBe('[lg] Red Bucket');
  });
});
