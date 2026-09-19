import { formatUGX } from './currency';

describe('formatUGX (UgaMarket — home to home currency utility)', () => {
  test('formats integer amounts with UGX prefix and thousands separators', () => {
    expect(formatUGX(10000)).toBe('UGX 10,000');
    expect(formatUGX(25000)).toBe('UGX 25,000');
    expect(formatUGX(1285000)).toBe('UGX 1,285,000');
  });

  test('handles zero and small values', () => {
    expect(formatUGX(0)).toBe('UGX 0');
    expect(formatUGX(500)).toBe('UGX 500');
  });

  test('rounds fractional input instead of producing decimals (money is integer UGX)', () => {
    expect(formatUGX(999.6)).toBe('UGX 1,000');
    expect(formatUGX(10.2)).toBe('UGX 10');
  });

  test('treats null/undefined/NaN as zero', () => {
    expect(formatUGX(null)).toBe('UGX 0');
    expect(formatUGX(undefined)).toBe('UGX 0');
    expect(formatUGX('not-a-number')).toBe('UGX 0');
  });
});
