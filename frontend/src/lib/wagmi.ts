import { http, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { base, baseSepolia } from 'wagmi/chains';
import { readEnv } from '@/lib/env';

const isTestnet = readEnv(process.env.NEXT_PUBLIC_CHAIN) === 'testnet';

export const activeChain = isTestnet ? baseSepolia : base;

const connectors = [
  injected({ target: 'metaMask' }),
  injected({ target: 'coinbaseWallet' }),
  injected({ target: 'rabby' }),
  injected({ target: 'phantom' }),
  injected(),
];

export const config = isTestnet
  ? createConfig({
      chains: [baseSepolia],
      connectors,
      multiInjectedProviderDiscovery: false,
      ssr: true,
      transports: {
        [baseSepolia.id]: http(),
      },
    })
  : createConfig({
      chains: [base],
      connectors,
      multiInjectedProviderDiscovery: false,
      ssr: true,
      transports: {
        [base.id]: http(),
      },
    });
