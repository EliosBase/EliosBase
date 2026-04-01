'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { SessionData } from '@/lib/session';

interface ClientSession extends SessionData {
  authenticated: boolean;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isSessionLoading: boolean;
  isSigningIn: boolean;
  session: ClientSession | null;
  setIsSigningIn: (v: boolean) => void;
  setSession: (s: ClientSession) => void;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const isAuthenticated = session?.authenticated ?? false;

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data: ClientSession = await res.json();
      setSession(data);
    } catch {
      setSession({ authenticated: false });
    } finally {
      setIsSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
    const onFocus = () => refreshSession();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshSession]);

  const value = useMemo<AuthContextType>(() => ({
    isAuthenticated,
    isSessionLoading,
    isSigningIn,
    session,
    setIsSigningIn,
    setSession,
    refreshSession,
  }), [isAuthenticated, isSessionLoading, isSigningIn, session, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
