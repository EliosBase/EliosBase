'use client';

import { AppKitProvider } from '@reown/appkit/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { appKitConfig, config } from '@/lib/wagmi';
import { useState } from 'react';

const disableWalletReconnect = process.env.NEXT_PUBLIC_WALLET_E2E_DISABLE_RECONNECT === '1';

export default function WalletProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            retry: 2,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={config} reconnectOnMount={!disableWalletReconnect}>
      <QueryClientProvider client={queryClient}>
        {appKitConfig ? <AppKitProvider {...appKitConfig}>{children}</AppKitProvider> : children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
