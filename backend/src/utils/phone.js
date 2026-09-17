/**
 * Uganda Phone Number Normalization and Validation Utility
 *
 * Normalizes all valid Uganda mobile numbers to canonical E.164 format:
 * Examples:
 *   0772123456    -> +256772123456
 *   256772123456  -> +256772123456
 *   +256772123456 -> +256772123456
 *   0701-234-567  -> +256701234567
 */

function normalizeUgandaPhone(phoneInput) {
  if (!phoneInput || typeof phoneInput !== 'string') {
    return {
      isValid: false,
      normalized: null,
      error: 'Phone number is required',
    };
  }

  // Strip all whitespace, dashes, parentheses, and dots
  let cleaned = phoneInput.trim().replace(/[\s\-().]/g, '');

  // Handle leading plus
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Handle local 0 prefix (e.g. 0772123456 -> 256772123456)
  if (cleaned.startsWith('0')) {
    cleaned = '256' + cleaned.substring(1);
  }

  // If number starts without 256 but is 9 digits starting with 7 or 3 (e.g. 772123456)
  if (cleaned.length === 9 && (cleaned.startsWith('7') || cleaned.startsWith('3'))) {
    cleaned = '256' + cleaned;
  }

  // Verify Uganda country code prefix (256) and total 12 digits
  // Mobile numbers in Uganda: 256 + (7X or 3X) + 7 digits = 12 digits
  const ugandaRegex = /^256(7\d|3\d|4\d)\d{7}$/;

  if (!ugandaRegex.test(cleaned)) {
    return {
      isValid: false,
      normalized: null,
      error: 'Invalid Uganda phone number format. Expected format: 07XXXXXXXX or +2567XXXXXXXX',
    };
  }

  return {
    isValid: true,
    normalized: '+' + cleaned,
    error: null,
  };
}

module.exports = {
  normalizeUgandaPhone,
};
