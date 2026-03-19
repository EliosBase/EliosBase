import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'testnet';
const chain = isTestnet ? baseSepolia : base;

const rpcUrl = process.env.BASE_RPC_URL
  || (isTestnet ? 'https://sepolia.base.org' : 'https://mainnet.base.org');

/**
 * Server-side viem public client for verifying transactions on Base.
 * Used in API routes only — not in browser code.
 */
export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});
