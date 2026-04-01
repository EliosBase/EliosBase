import { http, createConfig } from 'wagmi';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { baseSepolia, base } from 'wagmi/chains';
import { isTestnet } from '@/lib/chainConfig';

export { activeChain } from '@/lib/chainConfig';

const connectors = [
  injected({ target: 'metaMask' }),
  coinbaseWallet({ appName: 'EliosBase', preference: { options: 'all' } }),
  injected({ target: 'phantom' }),
  injected({ target: 'rabby' }),
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
