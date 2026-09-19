import apiClient, { ApiError, resolveImageUrl, setAuthToken, getAuthToken, clearAuthToken } from './client';

describe('api client (UgaMarket — home to home)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAuthToken();
    jest.restoreAllMocks();
  });

  test('exports get/post/patch/put/delete helpers', () => {
    expect(typeof apiClient.get).toBe('function');
    expect(typeof apiClient.post).toBe('function');
    expect(typeof apiClient.patch).toBe('function');
    expect(typeof apiClient.put).toBe('function');
    expect(typeof apiClient.delete).toBe('function');
  });

  test('normalizes backend errors into ApiError with status and message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: false, message: 'Insufficient stock for matooke' }),
    });

    await expect(apiClient.post('/cart/items', { productId: 1, quantity: 5 })).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Insufficient stock for matooke',
    });
  });

  test('network failure becomes ApiError with status 0', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiClient.get('/products')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
    });
  });

  test('401 responses dispatch the unauthorized event for session expiry handling', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: false, message: 'Token expired' }),
    });

    const listener = jest.fn();
    window.addEventListener('ugamarket:unauthorized', listener);
    try {
      await expect(apiClient.get('/cart')).rejects.toBeInstanceOf(ApiError);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('ugamarket:unauthorized', listener);
    }
  });

  test('resolveImageUrl passes through absolute URLs and resolves /images/ paths', () => {
    expect(resolveImageUrl('https://example.com/pic.jpg')).toBe('https://example.com/pic.jpg');
    expect(resolveImageUrl('/images/uploads/matooke.jpg')).toMatch(/\/images\/uploads\/matooke\.jpg$/);
    expect(resolveImageUrl(null)).toBeNull();
    expect(resolveImageUrl('javascript:alert(1)')).toBeNull();
  });

  test('auth token helpers persist and clear the session token', () => {
    setAuthToken('test-token-123');
    expect(getAuthToken()).toBe('test-token-123');
    expect(localStorage.getItem('ugamarket_token')).toBe('test-token-123');

    clearAuthToken();
    expect(getAuthToken()).toBeNull();
    expect(localStorage.getItem('ugamarket_token')).toBeNull();
  });
});
