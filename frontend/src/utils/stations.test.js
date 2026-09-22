import { isOpenNow, mapsUrl, parseHours } from './stations';

// Uganda is UTC+3 all year. Monday 2026-09-21 10:00 EAT === 07:00 UTC.
const at = (isoUtc) => new Date(isoUtc);

describe('parseHours', () => {
  test('understands day ranges with 12-hour times', () => {
    expect(parseHours('Mon - Sat: 8:00 AM - 6:30 PM')).toEqual({ days: [1, 2, 3, 4, 5, 6], open: 480, close: 1110 });
    expect(parseHours('Mon - Sun: 7:30 AM - 8:00 PM').days).toHaveLength(7);
  });

  test('returns null for text it cannot understand', () => {
    expect(parseHours('Contact station')).toBeNull();
    expect(parseHours('')).toBeNull();
    expect(parseHours(null)).toBeNull();
  });
});

describe('isOpenNow (evaluated in Uganda time)', () => {
  const hours = 'Mon - Sat: 8:00 AM - 6:30 PM';

  test('open during the day', () => {
    expect(isOpenNow(hours, at('2026-09-21T07:00:00Z'))).toBe(true); // Mon 10:00 EAT
  });

  test('closed before opening and after closing', () => {
    expect(isOpenNow(hours, at('2026-09-21T03:00:00Z'))).toBe(false); // Mon 06:00 EAT
    expect(isOpenNow(hours, at('2026-09-21T16:00:00Z'))).toBe(false); // Mon 19:00 EAT
  });

  test('closed on days outside the range', () => {
    expect(isOpenNow(hours, at('2026-09-20T09:00:00Z'))).toBe(false); // Sunday 12:00 EAT
  });

  test('uses Uganda time, not the viewer’s: 22:00 UTC Sat is already Sunday there', () => {
    expect(isOpenNow(hours, at('2026-09-26T22:00:00Z'))).toBe(false);
  });

  test('is null (unknown) when the hours cannot be parsed', () => {
    expect(isOpenNow('By appointment', at('2026-09-21T07:00:00Z'))).toBeNull();
  });
});

describe('mapsUrl', () => {
  test('builds an encoded search link', () => {
    const url = mapsUrl({ name: 'Nakasero Market Hub', addressText: 'Market Street', district: 'Kampala' });
    expect(url).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(url).toContain(encodeURIComponent('Nakasero Market Hub, Market Street, Kampala, Uganda'));
  });
});
