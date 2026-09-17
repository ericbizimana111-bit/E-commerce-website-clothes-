const { formatUGX, calculateSubtotal, calculateCommitment } = require('../src/utils/currency');

describe('Currency & Financial Calculations (UGX)', () => {
  test('formatUGX formats amounts with correct symbol and localization', () => {
    expect(formatUGX(25000)).toBe('UGX 25,000');
    expect(formatUGX(0)).toBe('UGX 0');
    expect(formatUGX(1500.75)).toBe('UGX 1,501');
  });

  test('calculateSubtotal accurately computes integer sums', () => {
    const items = [
      { unitPriceUgx: 28000, quantity: 2 }, // 56,000
      { unitPriceUgx: 4500, quantity: 3 },  // 13,500
      { unitPriceUgx: 2000, quantity: 1.5 }, // 3,000
    ];
    expect(calculateSubtotal(items)).toBe(72500);
  });

  test('calculateCommitment with default 30% percentage rule', () => {
    const rule = {
      ruleType: 'PERCENTAGE',
      percentageValue: 30.0,
      minCommitment: 5000,
    };

    // Total 100,000 -> 30% = 30,000, remaining = 70,000
    const result1 = calculateCommitment(100000, rule);
    expect(result1.commitmentAmount).toBe(30000);
    expect(result1.remainingBalance).toBe(70000);
    expect(result1.commitmentAmount + result1.remainingBalance).toBe(100000);

    // Total 10,000 -> 30% is 3,000, but min is 5,000 -> commitment = 5,000, remaining = 5,000
    const result2 = calculateCommitment(10000, rule);
    expect(result2.commitmentAmount).toBe(5000);
    expect(result2.remainingBalance).toBe(5000);

    // Total 4,000 -> less than minCommitment 5,000 -> commitment = 4,000, remaining = 0
    const result3 = calculateCommitment(4000, rule);
    expect(result3.commitmentAmount).toBe(4000);
    expect(result3.remainingBalance).toBe(0);
  });

  test('calculateCommitment with FLAT rule', () => {
    const rule = {
      ruleType: 'FLAT',
      flatValueUgx: 10000,
      minCommitment: 5000,
    };

    const result = calculateCommitment(50000, rule);
    expect(result.commitmentAmount).toBe(10000);
    expect(result.remainingBalance).toBe(40000);
  });
});
