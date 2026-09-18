import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient, { setAuthToken, clearAuthToken, getAuthToken } from '../api/client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => getAuthToken());
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const applySession = useCallback((authToken, authUser) => {
    setToken(authToken);
    setUser(authUser || null);
    setAuthToken(authToken);
  }, []);

  // Load the profile for an existing token so sessions survive page refreshes.
  const fetchProfile = useCallback(
    async (activeToken) => {
      if (!activeToken) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const res = await apiClient.get('/auth/me');
        if (res?.data?.user) {
          setUser(res.data.user);
        } else {
          applySession(null, null);
        }
      } catch {
        // Invalid/expired token: clear local state. A 401 has already fired
        // the 'ugamarket:unauthorized' event, handled by the listener below.
        applySession(null, null);
      } finally {
        setLoading(false);
      }
    },
    [applySession]
  );

  useEffect(() => {
    if (token) {
      fetchProfile(token);
    } else {
      setLoading(false);
    }
  }, [token, fetchProfile]);

  // Centralized 401 handling: clear invalid auth state once, wherever it fires.
  useEffect(() => {
    const handleUnauthorized = () => {
      setToken((prevToken) => {
        if (prevToken !== null) {
          applySession(null, null);
        }
        return prevToken;
      });
    };
    window.addEventListener('ugamarket:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('ugamarket:unauthorized', handleUnauthorized);
  }, [applySession]);

  const login = async (phone, password) => {
    setAuthError(null);
    try {
      const res = await apiClient.post('/auth/login', { phone, password });
      const authToken = res?.data?.token;
      const authUser = res?.data?.user;
      if (authToken) {
        applySession(authToken, authUser);
      }
      return { success: true, user: authUser };
    } catch (err) {
      const msg = err.message || 'Login failed. Please check your credentials.';
      setAuthError(msg);
      return { success: false, error: msg };
    }
  };

  const register = async ({ fullName, phone, email, password }) => {
    setAuthError(null);
    try {
      const payload = {
        fullName,
        phone,
        password,
        ...(email && email.trim() ? { email: email.trim() } : {}),
      };
      const res = await apiClient.post('/auth/register', payload);
      const authToken = res?.data?.token;
      const authUser = res?.data?.user;
      if (authToken) {
        applySession(authToken, authUser);
      }
      return { success: true, user: authUser };
    } catch (err) {
      const msg = err.message || 'Registration failed. Please check your details.';
      setAuthError(msg);
      return { success: false, error: msg };
    }
  };

  const logout = () => {
    applySession(null, null);
    setAuthError(null);
  };

  const refreshUser = () => {
    if (token) {
      return fetchProfile(token);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        loading,
        authError,
        login,
        register,
        logout,
        refreshUser,
        setAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
