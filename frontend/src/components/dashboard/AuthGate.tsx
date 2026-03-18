'use client';

import { createContext, useContext } from 'react';
import { useSiwe } from '@/hooks/useSiwe';

interface SiweContextType {
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SiweContext = createContext<SiweContextType | null>(null);

export function useSiweContext() {
  const ctx = useContext(SiweContext);
  if (!ctx) throw new Error('useSiweContext must be used within AuthGate');
  return ctx;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const siwe = useSiwe();
  return <SiweContext.Provider value={siwe}>{children}</SiweContext.Provider>;
}
