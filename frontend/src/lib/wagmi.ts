import { http, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { base, baseSepolia } from 'wagmi/chains';

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'testnet';

export const activeChain = isTestnet ? baseSepolia : base;

export const config = isTestnet
  ? createConfig({
      chains: [baseSepolia],
      connectors: [injected({ target: 'phantom' })],
      transports: {
        [baseSepolia.id]: http(),
      },
    })
  : createConfig({
      chains: [base],
      connectors: [injected({ target: 'phantom' })],
      transports: {
        [base.id]: http(),
      },
    });
