import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'testnet';

export const activeChain = isTestnet ? baseSepolia : base;

export const config = isTestnet
  ? createConfig({
      chains: [baseSepolia],
      transports: {
        [baseSepolia.id]: http(),
      },
    })
  : createConfig({
      chains: [base],
      transports: {
        [base.id]: http(),
      },
    });
