/**
 * Input guards for staff sign-in. Client-side conveniences only: the backend
 * re-validates everything and remains the security boundary.
 */
export const LIMITS = {
  email: 254,
  password: 100, // matches the backend limit; never blocks an existing password
};

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** No whitespace, no control/invisible characters, lower-cased, length-capped. */
export function sanitizeEmail(value) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s/g, '')
    .toLowerCase()
    .slice(0, LIMITS.email);
}

/** Control/invisible characters removed and length capped; spaces are allowed. */
export function sanitizePassword(value) {
  return String(value ?? '').replace(CONTROL_CHARS, '').slice(0, LIMITS.password);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? '').trim());
}
