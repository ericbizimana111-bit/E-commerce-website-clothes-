import { formatUGX } from './currency';

describe('formatUGX', () => {
  test('formats positive numbers with UGX prefix and comma grouping', () => {
    expect(formatUGX(25000)).toMatch(/UGX\s*25[,.]000/);
    expect(formatUGX(1500000)).toMatch(/UGX\s*1[,.]500[,.]000/);
  });

  test('formats 0 properly', () => {
    expect(formatUGX(0)).toBe('UGX 0');
  });

  test('rounds decimal inputs to integers (strict UGX)', () => {
    expect(formatUGX(1234.56)).toMatch(/UGX\s*1[,.]235/);
    expect(formatUGX(99.4)).toBe('UGX 99');
  });

  test('handles invalid, null, or string inputs gracefully', () => {
    expect(formatUGX(null)).toBe('UGX 0');
    expect(formatUGX(undefined)).toBe('UGX 0');
    expect(formatUGX('not-a-number')).toBe('UGX 0');
    expect(formatUGX('5000')).toMatch(/UGX\s*5[,.]000/);
  });
});
