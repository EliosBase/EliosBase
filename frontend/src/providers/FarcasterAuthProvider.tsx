'use client';

import { AuthKitProvider } from '@farcaster/auth-kit';
import { getConfiguredSiteUrl } from '@/lib/runtimeConfig';

const siteUrl = getConfiguredSiteUrl();

const farcasterConfig = {
  rpcUrl: 'https://mainnet.optimism.io',
  domain: typeof window !== 'undefined'
    ? window.location.host
    : (siteUrl
      ? new URL(siteUrl).host
      : 'eliosbase.net'),
  siweUri: typeof window !== 'undefined'
    ? window.location.origin
    : (siteUrl || 'https://eliosbase.net'),
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
