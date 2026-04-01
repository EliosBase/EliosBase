'use client';

import { AuthKitProvider } from '@farcaster/auth-kit';

const farcasterConfig = {
  rpcUrl: 'https://mainnet.optimism.io',
  domain: typeof window !== 'undefined'
    ? window.location.host
    : (process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host
      : 'eliosbase.net'),
  siweUri: typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_SITE_URL || 'https://eliosbase.net'),
};

export default function FarcasterAuthProvider({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_FC_AUTH_ENABLED !== 'true') {
    return <>{children}</>;
  }

  return (
    <AuthKitProvider config={farcasterConfig}>
      {children}
    </AuthKitProvider>
  );
}
