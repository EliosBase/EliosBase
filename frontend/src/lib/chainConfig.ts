/**
 * Single source of truth for chain configuration.
 * Replaces scattered NEXT_PUBLIC_BASE_CHAIN_ID / NEXT_PUBLIC_CHAIN reads.
 */
import { base, baseSepolia } from 'wagmi/chains';
import { readEnv } from '@/lib/env';

const chainEnv = readEnv(process.env.NEXT_PUBLIC_CHAIN);

export const isTestnet = chainEnv === 'testnet';

export const activeChain = isTestnet ? baseSepolia : base;

export const activeChainId = activeChain.id;

export const chainName = isTestnet ? 'Base Sepolia' : 'Base';
