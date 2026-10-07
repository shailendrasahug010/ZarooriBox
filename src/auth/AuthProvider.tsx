import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '../types';
import { isSupabaseConfigured } from '../data/supabase';
import { createLocalAuth } from './localAuth';
import { createSupabaseAuth } from './supabaseAuth';
import type { AuthService } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  service: AuthService;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string) => Promise<User>;
  signInDemo: () => Promise<User>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: { name?: string }) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => (isSupabaseConfigured ? createSupabaseAuth() : createLocalAuth()), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    service
      .getCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false));
    // Returning from Google, a password-reset link, expiry, or sign-out in another tab.
    return service.onChange?.((u, event) => {
      setUser((prev) => (prev?.id === u?.id && event !== 'updated' ? prev : u));
      setLoading(false);
      if (event === 'password_recovery' && !location.pathname.startsWith('/reset-password')) location.assign('/reset-password');
    });
  }, [service]);

  const wrap = useCallback(<A extends unknown[]>(fn: (...a: A) => Promise<User>) => async (...a: A) => {
    const u = await fn(...a);
    setUser(u);
    return u;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      service,
      signIn: wrap(service.signIn.bind(service)),
      signUp: wrap(service.signUp.bind(service)),
      signInDemo: wrap(service.signInDemo.bind(service)),
      signInWithGoogle: () => service.signInWithGoogle(),
      signOut: async () => {
        await service.signOut();
        setUser(null);
      },
      updateProfile: async (patch) => setUser(await service.updateProfile(patch)),
      deleteAccount: async () => {
        await service.deleteAccount();
        setUser(null);
      },
    }),
    [user, loading, service, wrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
