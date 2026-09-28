import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api, AUTH_EXPIRED_EVENT, type User } from './api';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  markOnboarded: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ user: User }>('/auth/login', { method: 'POST', body: { username, password } });
    setUser(r.user);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const r = await api<{ user: User }>('/auth/register', { method: 'POST', body: { username, password } });
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
  }, []);

  const markOnboarded = useCallback(async () => {
    setUser((u) => (u ? { ...u, onboardedAt: u.onboardedAt ?? new Date().toISOString() } : u));
    await api('/auth/onboarding', { method: 'POST' }).catch(() => undefined);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, markOnboarded }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center text-slate-500">...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
