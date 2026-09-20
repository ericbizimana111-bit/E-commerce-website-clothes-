/**
 * Centralized API Client for UgaMarket — home to home.
 *
 * Single place for: base URL, auth token header, JSON handling,
 * error normalization and 401 session-expiry signalling.
 * Components must never call fetch() directly.
 */

// API base URL: set REACT_APP_API_URL at build time for standalone API
// origins (PUBLIC configuration only — never secrets). Unset builds fall back
// to same-origin '/api', which works behind the production reverse proxy and
// in local development via the CRA dev proxy.
const API_BASE = process.env.REACT_APP_API_URL || '/api';

const TOKEN_STORAGE_KEY = 'ugamarket_token';

/** Backend absolute origin, used to resolve relative /images/... URLs. */
export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return API_BASE.replace(/\/api\/?$/, '');
  }
})();

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/** In-memory token mirror so consumers can set/clear without touching localStorage directly. */
let currentToken = null;
try {
  currentToken = localStorage.getItem(TOKEN_STORAGE_KEY);
} catch {
  /* storage unavailable (tests / private mode) */
}

export function setAuthToken(token) {
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

export function clearAuthToken() {
  setAuthToken(null);
}

export function getAuthToken() {
  return currentToken;
}

/**
 * Resolve a product/category image URL to a loadable absolute URL.
 * The backend serves uploaded images from /images/... on its own origin;
 * absolute http(s) URLs pass through unchanged.
 */
export function resolveImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/images/')) return `${API_ORIGIN}${trimmed}`;
  return null;
}

export async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const token = currentToken;

  const headers = {
    'Accept': 'application/json',
    ...(options.body && typeof options.body === 'object' && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
    body:
      options.body && typeof options.body === 'object' && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  };

  try {
    const response = await fetch(url, config);

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { message: text };
    }

    if (!response.ok) {
      if (response.status === 401) {
        // Session expired / invalid: notify listeners so auth state can be cleared.
        window.dispatchEvent(new CustomEvent('ugamarket:unauthorized'));
      }
      const message =
        data?.message ||
        data?.errors?.[0]?.message ||
        `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error.message || 'Network connection failed. Please check your internet connection.',
      0
    );
  }
}

export const api = {
  get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => request(endpoint, { ...options, method: 'POST', body }),
  patch: (endpoint, body, options) => request(endpoint, { ...options, method: 'PATCH', body }),
  put: (endpoint, body, options) => request(endpoint, { ...options, method: 'PUT', body }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
