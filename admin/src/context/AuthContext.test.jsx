import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth, hasRole, CATALOG_ROLES, OPERATIONS_ROLES } from './AuthContext';

const TestConsumer = () => {
  const { admin, isAuthenticated, loading, login, logout, role } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="role">{role || 'none'}</span>
      <span data-testid="name">{admin?.fullName || 'anon'}</span>
      <button
        type="button"
        data-testid="btn-login"
        onClick={() =>
          login('admin@ugamarket.ug', 'SecretPass123').catch(() => {})
        }
      >
        login
      </button>
      <button type="button" data-testid="btn-logout" onClick={logout}>
        logout
      </button>
    </div>
  );
};

const renderAuth = () =>
  render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  );

function mockFetchOnce(body, status = 200) {
  return vi.fn().mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('AdminAuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts unauthenticated without a stored token', async () => {
    vi.stubGlobal('fetch', vi.fn());
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('authed').textContent).toBe('false');
    expect(screen.getByTestId('role').textContent).toBe('none');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('logs in with email/password and stores the session', async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      data: {
        token: 'admin-jwt',
        admin: { id: 'a1', fullName: 'Ops Manager', role: 'ADMIN' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByTestId('btn-login').click();
    });

    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('true'));
    expect(screen.getByTestId('name').textContent).toBe('Ops Manager');
    expect(screen.getByTestId('role').textContent).toBe('ADMIN');
    expect(localStorage.getItem('ugamarket_admin_token')).toBe('admin-jwt');

    // Login hits the dedicated admin auth endpoint with a JSON body.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/admin/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      email: 'admin@ugamarket.ug',
      password: 'SecretPass123',
    });
  });

  it('restores the session from a stored token via /admin/auth/me', async () => {
    localStorage.setItem('ugamarket_admin_token', 'stored-jwt');
    vi.stubGlobal(
      'fetch',
      mockFetchOnce({
        success: true,
        data: { admin: { id: 'a2', fullName: 'Super Admin', role: 'SUPER_ADMIN' } },
      }),
    );

    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('true'));
    expect(screen.getByTestId('role').textContent).toBe('SUPER_ADMIN');
  });

  it('clears the session when the 401 event fires (expired token)', async () => {
    localStorage.setItem('ugamarket_admin_token', 'expired-jwt');
    vi.stubGlobal(
      'fetch',
      mockFetchOnce({ success: false, message: 'Authentication token has expired' }, 401),
    );

    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    expect(localStorage.getItem('ugamarket_admin_token')).toBeNull();
  });

  it('logout clears the admin session', async () => {
    localStorage.setItem('ugamarket_admin_token', 'some-jwt');
    vi.stubGlobal(
      'fetch',
      mockFetchOnce({
        success: true,
        data: { admin: { id: 'a1', fullName: 'Ops', role: 'DISPATCHER' } },
      }),
    );

    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('true'));

    act(() => {
      screen.getByTestId('btn-logout').click();
    });
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    expect(localStorage.getItem('ugamarket_admin_token')).toBeNull();
  });
});

describe('role helpers (mirror backend RBAC sets)', () => {
  it('catalog roles exclude DISPATCHER (backend: ADMIN, SUPER_ADMIN only)', () => {
    expect(hasRole('ADMIN', CATALOG_ROLES)).toBe(true);
    expect(hasRole('SUPER_ADMIN', CATALOG_ROLES)).toBe(true);
    expect(hasRole('DISPATCHER', CATALOG_ROLES)).toBe(false);
  });

  it('operations roles include DISPATCHER (orders/deliveries)', () => {
    expect(hasRole('DISPATCHER', OPERATIONS_ROLES)).toBe(true);
    expect(hasRole('ADMIN', OPERATIONS_ROLES)).toBe(true);
    expect(hasRole('SUPER_ADMIN', OPERATIONS_ROLES)).toBe(true);
  });

  it('missing roles are never authorized', () => {
    expect(hasRole(null, OPERATIONS_ROLES)).toBe(false);
    expect(hasRole(undefined, CATALOG_ROLES)).toBe(false);
  });
});
