import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, apiUpload, setUnauthorizedHandler, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    // Keep the splash up briefly so it doesn't flash on fast connections.
    Promise.all([api('/auth/me'), new Promise((r) => setTimeout(r, 700))])
      .then(([data]) => setUser(data.user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const startSession = useCallback(({ token, user: nextUser }) => {
    tokenStore.set(token);
    setUser(nextUser);
    return nextUser;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (credentials) => startSession(await api('/auth/login', { method: 'POST', body: credentials })),
      register: async (details) => startSession(await api('/auth/register', { method: 'POST', body: details })),
      logout,
      requestVerification: (email) => api('/auth/verify-email/request', { method: 'POST', body: email ? { email } : {} }),
      confirmVerification: async (code) => {
        const data = await api('/auth/verify-email/confirm', { method: 'POST', body: { code } });
        setUser(data.user);
        return data.user;
      },
      uploadPhoto: async (file) => {
        const data = await apiUpload('/users/me/avatar', file);
        setUser(data.user);
        return data.user;
      },
      removePhoto: async () => {
        const data = await api('/users/me/avatar', { method: 'DELETE' });
        setUser(data.user);
        return data.user;
      },
      updateProfile: async (changes) => {
        const data = await api('/users/me', { method: 'PATCH', body: changes });
        setUser(data.user);
        return data.user;
      },
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
    }),
    [user, loading, logout, startSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
