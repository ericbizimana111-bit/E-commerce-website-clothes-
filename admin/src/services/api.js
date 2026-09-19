/**
 * Centralized API client for the UgaMarket Operations Console.
 *
 * Single place for: base URL, admin token header, JSON handling, error
 * normalization, and 401 session-expiry signalling. Components never call
 * fetch() directly. Admin tokens are stored under a dedicated key, separate
 * from any customer token (backend uses distinct secrets/contexts).
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const TOKEN_STORAGE_KEY = 'ugamarket_admin_token';

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

let currentToken = null;
try {
  currentToken = localStorage.getItem(TOKEN_STORAGE_KEY);
} catch {
  /* storage unavailable (tests / private mode) */
}

export function setAdminToken(token) {
  currentToken = token || null;
  try {
    if (currentToken) {
      localStorage.setItem(TOKEN_STORAGE_KEY, currentToken);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    /* non-fatal */
  }
}

export function getAdminToken() {
  return currentToken;
}

export function clearAdminToken() {
  setAdminToken(null);
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = {
    Accept: 'application/json',
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    ...options.headers,
  };

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      'Network connection failed. Check your internet connection and try again.',
      0,
    );
  }

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Session expired or invalid: single signalling point for the AuthContext.
      window.dispatchEvent(new CustomEvent('ugamarket:admin:unauthorized'));
    }
    // Prefer a field-specific validation message over the generic envelope.
    const message =
      data?.errors?.[0]?.message ||
      data?.message ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

export const api = {
  get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options) => request(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options) => request(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
