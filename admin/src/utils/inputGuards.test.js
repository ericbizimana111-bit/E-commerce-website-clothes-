import { describe, expect, it } from 'vitest';
import { LIMITS, isValidEmail, sanitizeEmail, sanitizePassword } from './inputGuards';

describe('sanitizeEmail', () => {
  it('removes whitespace and control characters, lower-cases', () => {
    expect(sanitizeEmail(' Admin @UgaMarket.UG\u0000 ')).toBe('admin@ugamarket.ug');
  });
  it('caps the length', () => {
    expect(sanitizeEmail('a'.repeat(500))).toHaveLength(LIMITS.email);
  });
});

describe('sanitizePassword', () => {
  it('caps the length and drops control characters but keeps spaces', () => {
    expect(sanitizePassword('x'.repeat(500))).toHaveLength(LIMITS.password);
    expect(sanitizePassword('pass\u200B word\u0007')).toBe('pass word');
  });
});

describe('isValidEmail', () => {
  it('accepts well-formed addresses only', () => {
    expect(isValidEmail('admin@ugamarket.ug')).toBe(true);
    ['admin', 'admin@', '@x.ug', 'a@b', 'a b@c.ug'].forEach((bad) => expect(isValidEmail(bad)).toBe(false));
  });
});
