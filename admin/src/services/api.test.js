import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import api, { ApiError, setAdminToken, getAdminToken, clearAdminToken } from './api';

describe('admin API client', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAdminToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists and clears the admin token under the admin-only key', () => {
    setAdminToken('admin-token-1');
    expect(getAdminToken()).toBe('admin-token-1');
    expect(localStorage.getItem('ugamarket_admin_token')).toBe('admin-token-1');

    clearAdminToken();
    expect(getAdminToken()).toBeNull();
    expect(localStorage.getItem('ugamarket_admin_token')).toBeNull();
  });

  it('sends the Bearer token on authenticated requests', async () => {
    setAdminToken('tok-123');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/admin/orders');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok-123');
  });

  it('normalizes backend errors into ApiError with status and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, message: 'Insufficient stock' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(api.post('/admin/products/1/inventory/restock', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Insufficient stock',
    });
  });

  it('extracts the first validation error message from Zod-style error payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            message: 'Validation failed',
            errors: [{ field: 'body.slug', message: 'Slug must be lowercase' }],
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(api.post('/admin/products', {})).rejects.toMatchObject({
      status: 400,
      message: 'Slug must be lowercase',
    });
  });

  it('network failure becomes ApiError with status 0 and a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(api.get('/admin/orders')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
    });
  });

  it('401 responses dispatch the admin unauthorized event exactly once', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, message: 'Token expired' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const listener = vi.fn();
    window.addEventListener('ugamarket:admin:unauthorized', listener);
    try {
      await expect(api.get('/admin/auth/me')).rejects.toBeInstanceOf(ApiError);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('ugamarket:admin:unauthorized', listener);
    }
  });
});
