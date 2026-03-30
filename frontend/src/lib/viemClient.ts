import { createPublicClient } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { readEnv } from '@/lib/env';
import { getBaseRpcTransport } from '@/lib/baseRpc';

const isTestnet = readEnv(process.env.NEXT_PUBLIC_CHAIN) === 'testnet';
const chain = isTestnet ? baseSepolia : base;

/**
 * Server-side viem public client for verifying transactions on Base.
 * Used in API routes only — not in browser code.
 */
export const publicClient = createPublicClient({
  chain,
  transport: getBaseRpcTransport(isTestnet),
});
