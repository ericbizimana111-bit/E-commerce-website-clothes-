import {
  LIMITS,
  normalizeUgandaPhone,
  passwordStrength,
  sanitizeEmail,
  sanitizeLine,
  sanitizeMultiline,
  sanitizeName,
  sanitizePassword,
  sanitizePhone,
  validateEmail,
  validateName,
  validateNewPassword,
  validatePhone
} from './inputGuards';

describe('sanitizePhone', () => {
  test('keeps only digits and a single leading +', () => {
    expect(sanitizePhone('0770-000 abc 000')).toBe('0770000000');
    expect(sanitizePhone('+256 770 000 000')).toBe('+256770000000');
    expect(sanitizePhone('07+70')).toBe('0770');
  });

  test('caps the length so it cannot grow without limit', () => {
    expect(sanitizePhone('0'.repeat(50))).toHaveLength(LIMITS.phoneLocal);
    expect(sanitizePhone(`+${'2'.repeat(50)}`)).toHaveLength(LIMITS.phoneIntl);
  });
});

describe('phone validation', () => {
  test('accepts Uganda mobile formats and normalises them', () => {
    expect(normalizeUgandaPhone('0770000000')).toBe('+256770000000');
    expect(normalizeUgandaPhone('+256770000000')).toBe('+256770000000');
    expect(validatePhone('0700123456')).toBeNull();
  });

  test('rejects everything else', () => {
    ['', '077000', '0870000000', '+254770000000', 'abcdefghij', '07700000000'].forEach((bad) => {
      expect(validatePhone(bad)).toBe('errPhoneInvalid');
    });
  });
});

describe('names', () => {
  test('sanitizeName strips digits, symbols and markup', () => {
    expect(sanitizeName('  Sarah <b>Nam4ubiru</b>!')).toBe('Sarah bNamubirub');
    expect(sanitizeName("Jean-Luc O'Brien Jr.")).toBe("Jean-Luc O'Brien Jr.");
    expect(sanitizeName('Zoë Ñandú')).toBe('Zoë Ñandú');
  });

  test('is length-capped', () => {
    expect(sanitizeName('a'.repeat(500))).toHaveLength(LIMITS.fullName);
  });

  test('validateName wants at least two letters', () => {
    expect(validateName('A')).toBe('errNameRequired');
    expect(validateName('  ')).toBe('errNameRequired');
    expect(validateName('Sarah Namubiru')).toBeNull();
  });
});

describe('email', () => {
  test('sanitizeEmail removes whitespace, lower-cases and caps length', () => {
    expect(sanitizeEmail(' Sarah @Example.COM ')).toBe('sarah@example.com');
    expect(sanitizeEmail('a'.repeat(400))).toHaveLength(LIMITS.email);
  });

  test('is optional but must be well formed when given', () => {
    expect(validateEmail('')).toBeNull();
    expect(validateEmail('sarah@example.com')).toBeNull();
    ['sarah', 'sarah@', '@example.com', 'sarah@example', 'a b@example.com'].forEach((bad) => {
      expect(validateEmail(bad)).toBe('errEmailInvalid');
    });
  });
});

describe('passwords', () => {
  test('are length-capped and stripped of control characters', () => {
    expect(sanitizePassword('x'.repeat(500))).toHaveLength(LIMITS.passwordSignup);
    expect(sanitizePassword('ab\u0000c​d')).toBe('abcd');
    expect(sanitizePassword('with space ok')).toBe('with space ok');
  });

  test('new passwords need 8+ characters with a letter and a number', () => {
    expect(validateNewPassword('short1')).toBe('errPasswordShort');
    expect(validateNewPassword('allletters')).toBe('errPasswordRules');
    expect(validateNewPassword('12345678')).toBe('errPasswordRules');
    expect(validateNewPassword('Matooke2026')).toBeNull();
  });

  test('strength meter grows with length and variety', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('abcdefg1')).toBeGreaterThanOrEqual(1);
    expect(passwordStrength('Matooke2026!x')).toBe(4);
  });
});

describe('free text', () => {
  test('sanitizeLine collapses whitespace and caps length', () => {
    expect(sanitizeLine('  Plot   12 \n Ntinda ', 40)).toBe('Plot 12 Ntinda ');
    expect(sanitizeLine('x'.repeat(999), 30)).toHaveLength(30);
  });

  test('sanitizeMultiline keeps line breaks, drops control characters, caps length', () => {
    expect(sanitizeMultiline('line1\r\nline2\u0007')).toBe('line1\nline2');
    expect(sanitizeMultiline('y'.repeat(5000))).toHaveLength(LIMITS.notes);
  });
});
