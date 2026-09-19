import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { setAdminToken, getAdminToken } from '../services/api';

/**
 * Admin authentication context.
 *
 * Uses the backend's dedicated admin auth context (email + password, admin
 * JWT, separate secret from customer tokens). Sessions survive refresh via
 * GET /api/admin/auth/me; invalid/expired tokens are cleared centrally when
 * the API client fires the 401 event.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(getAdminToken()));
  // Track the token in state so isAuthenticated stays reactive (the module
  // mirror in api.js is intentionally not observable).
  const [token, setToken] = useState(() => getAdminToken());

  const applySession = useCallback((sessionToken, adminUser) => {
    setToken(sessionToken || null);
    setAdminToken(sessionToken);
    setAdmin(adminUser || null);
  }, []);

  useEffect(() => {
    let active = true;
    if (!getAdminToken()) {
      setLoading(false);
      return undefined;
    }
    api
      .get('/admin/auth/me')
      .then((res) => {
        if (active && res?.data?.admin) {
          setAdmin(res.data.admin);
        } else if (active) {
          applySession(null, null);
        }
      })
      .catch(() => {
        // 401 already fired the unauthorized event; clear any stale state.
        if (active) applySession(null, null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      applySession(null, null);
    };
    window.addEventListener('ugamarket:admin:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('ugamarket:admin:unauthorized', handleUnauthorized);
  }, [applySession]);

  const login = useCallback(
    async (email, password) => {
      const res = await api.post('/admin/auth/login', { email: email.trim(), password });
      const { token, admin: adminUser } = res?.data || {};
      if (!token || !adminUser) {
        throw new Error('Login response did not include an admin session.');
      }
      applySession(token, adminUser);
      return adminUser;
    },
    [applySession],
  );

  const logout = useCallback(() => {
    applySession(null, null);
  }, [applySession]);

  const value = useMemo(
    () => ({
      admin,
      isAuthenticated: Boolean(token && admin),
      loading,
      login,
      logout,
      role: admin?.role || null,
    }),
    [admin, token, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

/** Roles allowed to manage catalog + inventory (backend enforces the same set). */
export const CATALOG_ROLES = ['ADMIN', 'SUPER_ADMIN'];

/** Roles allowed to operate orders + deliveries (backend enforces the same set). */
export const OPERATIONS_ROLES = ['DISPATCHER', 'ADMIN', 'SUPER_ADMIN'];

export function hasRole(role, allowed) {
  return Boolean(role) && allowed.includes(role);
}
