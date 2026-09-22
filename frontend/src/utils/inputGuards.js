/**
 * Input guards for authentication and other user-typed fields.
 *
 * Two layers, both client-side conveniences (the backend re-validates
 * everything and remains the security boundary):
 *   - sanitize*()  runs on every keystroke and silently drops characters that
 *                  can never be valid, and caps the length;
 *   - validate*()  runs on blur/submit and returns a translation key (or null).
 */

export const LIMITS = {
  fullName: 80,
  email: 254,
  phoneLocal: 10, // 07XXXXXXXX
  phoneIntl: 13, // +2567XXXXXXXX
  passwordSignup: 72, // bcrypt only uses the first 72 bytes
  passwordLogin: 100, // never lock out an existing longer password
  addressLabel: 40,
  street: 200,
  district: 60,
  notes: 1000,
  search: 100
};

// Control characters and invisible direction/format marks.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Strip control/invisible characters and cap the length. */
export function sanitizeText(value, max) {
  return String(value ?? '').replace(CONTROL_CHARS, '').slice(0, max);
}

/** Single-line text: also collapses newlines and runs of spaces. */
export function sanitizeLine(value, max) {
  return sanitizeText(value, max * 2)
    .replace(/\s+/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, max);
}

/** Names: letters (any script), spaces, hyphen, apostrophe and full stop. */
export function sanitizeName(value) {
  return sanitizeText(value, LIMITS.fullName * 2)
    .replace(/[^\p{L}\p{M}\s'’.-]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, LIMITS.fullName);
}

/** Phone: digits plus one leading "+", spaces allowed while typing. */
export function sanitizePhone(value) {
  const raw = String(value ?? '').replace(/[^\d+\s]/g, '');
  const hasPlus = raw.trimStart().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  const cap = hasPlus ? LIMITS.phoneIntl - 1 : LIMITS.phoneLocal;
  return `${hasPlus ? '+' : ''}${digits.slice(0, cap)}`;
}

/** Email: no whitespace, lower-cased, length-capped. */
export function sanitizeEmail(value) {
  return sanitizeText(value, LIMITS.email).replace(/\s/g, '').toLowerCase();
}

/** Password: control characters removed, length capped (spaces are allowed). */
export function sanitizePassword(value, max = LIMITS.passwordSignup) {
  return sanitizeText(value, max);
}

/** Free-text (notes): keep newlines, drop other control characters. */
export function sanitizeMultiline(value, max = LIMITS.notes) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .slice(0, max);
}

/** Canonical +2567XXXXXXXX form the API expects, or null if not a Uganda mobile. */
export function normalizeUgandaPhone(value) {
  const compact = String(value ?? '').replace(/\s/g, '');
  if (/^07\d{8}$/.test(compact)) return `+256${compact.slice(1)}`;
  if (/^\+2567\d{8}$/.test(compact)) return compact;
  if (/^2567\d{8}$/.test(compact)) return `+${compact}`;
  return null;
}

export function validatePhone(value) {
  return normalizeUgandaPhone(value) ? null : 'errPhoneInvalid';
}

export function validateName(value) {
  const name = String(value ?? '').trim();
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return 'errNameRequired';
  if (!/^[\p{L}\p{M}\s'’.-]+$/u.test(name)) return 'errNameChars';
  return null;
}

/** Optional field: empty is fine. */
export function validateEmail(value) {
  const email = String(value ?? '').trim();
  if (!email) return null;
  if (email.length > LIMITS.email) return 'errEmailInvalid';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? null : 'errEmailInvalid';
}

export function validateNewPassword(value) {
  const pw = String(value ?? '');
  if (pw.length < 8) return 'errPasswordShort';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'errPasswordRules';
  return null;
}

export function validateLoginPassword(value) {
  return value ? null : 'errPasswordRequired';
}

/** 0–4 score used by the strength meter. */
export function passwordStrength(value) {
  const pw = String(value ?? '');
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  if (pw.length < 8) return 1;
  return Math.max(1, Math.min(score, 4));
}
