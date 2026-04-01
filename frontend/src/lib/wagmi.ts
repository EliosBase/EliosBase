import { http, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { baseSepolia, base } from 'wagmi/chains';
import { activeChain, isTestnet } from '@/lib/chainConfig';

export { activeChain } from '@/lib/chainConfig';

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
