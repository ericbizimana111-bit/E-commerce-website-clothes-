import { describe, expect, it } from 'vitest';
import { formatHours, parseHours, to12h, to24h } from './openingHours';

describe('time conversion', () => {
  it('converts 24h to 12h text', () => {
    expect(to12h('08:00')).toBe('8:00 AM');
    expect(to12h('18:30')).toBe('6:30 PM');
    expect(to12h('00:15')).toBe('12:15 AM');
    expect(to12h('12:00')).toBe('12:00 PM');
    expect(to12h('25:00')).toBe('');
    expect(to12h('')).toBe('');
  });

  it('converts 12h text back to 24h', () => {
    expect(to24h('8:00 AM')).toBe('08:00');
    expect(to24h('6:30 pm')).toBe('18:30');
    expect(to24h('12:00 AM')).toBe('00:00');
    expect(to24h('12:45 PM')).toBe('12:45');
    expect(to24h('13:00 PM')).toBe('');
  });
});

describe('formatHours', () => {
  it('composes the text the storefront parses', () => {
    expect(formatHours({ fromDay: 'Mon', toDay: 'Sat', open: '08:00', close: '18:30' })).toBe('Mon - Sat: 8:00 AM - 6:30 PM');
    expect(formatHours({ fromDay: 'Sun', toDay: 'Sun', open: '10:00', close: '14:00' })).toBe('Sun: 10:00 AM - 2:00 PM');
  });

  it('refuses incomplete or inverted hours', () => {
    expect(formatHours({ fromDay: 'Mon', toDay: 'Sat', open: '', close: '18:00' })).toBeNull();
    expect(formatHours({ fromDay: 'Mon', toDay: 'Sat', open: '18:00', close: '08:00' })).toBeNull();
    expect(formatHours({ fromDay: 'Mon', toDay: 'Sat', open: '08:00', close: '08:00' })).toBeNull();
    expect(formatHours({ fromDay: 'Xyz', toDay: 'Sat', open: '08:00', close: '18:00' })).toBeNull();
  });
});

describe('parseHours', () => {
  it('round-trips with formatHours', () => {
    const parts = { fromDay: 'Mon', toDay: 'Sun', open: '07:30', close: '20:00' };
    expect(parseHours(formatHours(parts))).toEqual(parts);
  });

  it('reads seeded station text', () => {
    expect(parseHours('Mon - Sat: 8:00 AM - 6:30 PM')).toEqual({ fromDay: 'Mon', toDay: 'Sat', open: '08:00', close: '18:30' });
  });

  it('returns null for free text', () => {
    expect(parseHours('Open 24 hours')).toBeNull();
    expect(parseHours('By appointment')).toBeNull();
    expect(parseHours('')).toBeNull();
  });
});
