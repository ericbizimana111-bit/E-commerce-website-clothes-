const { normalizeUgandaPhone } = require('../src/utils/phone');

describe('Uganda Phone Normalization Utility', () => {
  describe('Valid Phone Formats', () => {
    test('normalizes 10-digit local format starting with 0 (0772123456)', () => {
      const result = normalizeUgandaPhone('0772123456');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+256772123456');
      expect(result.error).toBeNull();
    });

    test('normalizes 12-digit international format without plus (256772123456)', () => {
      const result = normalizeUgandaPhone('256772123456');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+256772123456');
      expect(result.error).toBeNull();
    });

    test('normalizes 13-character international format with plus (+256772123456)', () => {
      const result = normalizeUgandaPhone('+256772123456');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+256772123456');
      expect(result.error).toBeNull();
    });

    test('normalizes Airtel numbers (0701234567, 0752123456)', () => {
      const resultAirtel1 = normalizeUgandaPhone('0701234567');
      expect(resultAirtel1.isValid).toBe(true);
      expect(resultAirtel1.normalized).toBe('+256701234567');

      const resultAirtel2 = normalizeUgandaPhone('0752123456');
      expect(resultAirtel2.isValid).toBe(true);
      expect(resultAirtel2.normalized).toBe('+256752123456');
    });

    test('normalizes numbers with dashes, spaces, and formatting characters', () => {
      const result = normalizeUgandaPhone('  +256 772-123-456  ');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+256772123456');
    });

    test('normalizes 9-digit national number without leading 0 (772123456)', () => {
      const result = normalizeUgandaPhone('772123456');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+256772123456');
    });
  });

  describe('Invalid Phone Formats', () => {
    test('rejects empty or null phone input', () => {
      expect(normalizeUgandaPhone('').isValid).toBe(false);
      expect(normalizeUgandaPhone(null).isValid).toBe(false);
      expect(normalizeUgandaPhone(undefined).isValid).toBe(false);
    });

    test('rejects phone with too few digits (e.g. 077212345)', () => {
      const result = normalizeUgandaPhone('077212345');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBeNull();
    });

    test('rejects phone with too many digits (e.g. 077212345678)', () => {
      const result = normalizeUgandaPhone('077212345678');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBeNull();
    });

    test('rejects non-Uganda country codes (e.g. Kenya +254712345678)', () => {
      const result = normalizeUgandaPhone('+254712345678');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBeNull();
    });

    test('rejects non-numeric characters inside the number body', () => {
      const result = normalizeUgandaPhone('0772ABC456');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBeNull();
    });
  });
});
