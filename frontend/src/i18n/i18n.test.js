import en from './en';
import lg from './lg';
import sw from './sw';
import fr from './fr';
import MARKET from './market';
import { detectBrowserLanguage, translate, TRANSLATIONS } from './index';

const enKeys = Object.keys(en).sort();

describe('translation dictionaries', () => {
  test.each([
    ['lg', lg],
    ['sw', sw],
    ['fr', fr]
  ])('%s has exactly the same keys as English', (code, dict) => {
    const keys = Object.keys(dict).sort();
    expect(enKeys.filter((k) => !keys.includes(k))).toEqual([]);
    expect(keys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  test.each(['lg', 'sw', 'fr'])('%s keeps every {placeholder} the English text uses', (code) => {
    const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort().join(',');
    const broken = enKeys.filter((key) => placeholders(en[key]) !== placeholders(TRANSLATIONS[code][key]));
    expect(broken).toEqual([]);
  });

  test('no translation is empty', () => {
    Object.entries(TRANSLATIONS).forEach(([, dict]) => {
      Object.values(dict).forEach((text) => expect(String(text).trim()).not.toBe(''));
    });
  });
});

describe('marketplace dictionary', () => {
  const marketEn = Object.keys(MARKET.en).sort();

  test.each(['lg', 'sw', 'fr'])('%s has exactly the same marketplace keys as English', (code) => {
    const keys = Object.keys(MARKET[code]).sort();
    expect(marketEn.filter((k) => !keys.includes(k))).toEqual([]);
    expect(keys.filter((k) => !marketEn.includes(k))).toEqual([]);
  });

  test.each(['lg', 'sw', 'fr'])('%s keeps every marketplace {placeholder}', (code) => {
    const placeholders = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(',');
    const broken = marketEn.filter((key) => placeholders(MARKET.en[key]) !== placeholders(MARKET[code][key]));
    expect(broken).toEqual([]);
  });

  test('Visa / MasterCard are no longer advertised', () => {
    ['faq3A', 'trustPayDesc', 'deliveryPayDesc'].forEach((key) => {
      Object.values(TRANSLATIONS).forEach((dict) => expect(dict[key]).not.toMatch(/visa|mastercard/i));
    });
  });
});

describe('translate()', () => {
  test('returns the string in the requested language', () => {
    expect(translate('fr', 'home')).toBe('Accueil');
    expect(translate('sw', 'cart')).toBe('Kikapu');
  });

  test('fills {placeholders}', () => {
    expect(translate('en', 'hello', { name: 'Sarah' })).toBe('Hello, Sarah');
    expect(translate('fr', 'hello', { name: 'Sarah' })).toBe('Bonjour, Sarah');
  });

  test('picks the singular / plural form from count', () => {
    expect(translate('en', 'itemsCount', { count: 1 })).toBe('1 item');
    expect(translate('en', 'itemsCount', { count: 3 })).toBe('3 items');
    expect(translate('fr', 'productsCount', { count: 0 })).toBe('0 produits');
  });

  test('falls back to English, then to the key itself', () => {
    expect(translate('xx', 'home')).toBe('Home');
    expect(translate('en', 'doesNotExist')).toBe('doesNotExist');
  });

  test('leaves unknown placeholders untouched', () => {
    expect(translate('en', 'hello', {})).toBe('Hello, {name}');
  });
});

describe('detectBrowserLanguage()', () => {
  test('follows the first supported browser language', () => {
    expect(detectBrowserLanguage(['fr-CA', 'en'])).toBe('fr');
    expect(detectBrowserLanguage(['de', 'sw-KE'])).toBe('sw');
  });

  test('defaults to English', () => {
    expect(detectBrowserLanguage(['de', 'ja'])).toBe('en');
    expect(detectBrowserLanguage([])).toBe('en');
  });
});
