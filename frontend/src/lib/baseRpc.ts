import { fallback, http } from 'viem';
import { readEnv } from '@/lib/env';

const BASE_MAINNET_RPC_URLS: string[] = [
  'https://base-rpc.publicnode.com',
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://1rpc.io/base',
  'https://base-mainnet.public.blastapi.io',
] as const;

const BASE_SEPOLIA_RPC_URLS: string[] = [
  'https://sepolia.base.org',
] as const;

export function getBaseRpcUrl(isTestnet: boolean) {
  return getBaseRpcUrls(isTestnet)[0];
}

export function getBaseRpcTransport(isTestnet: boolean) {
  return fallback(
    getBaseRpcUrls(isTestnet).map((url) => http(url, { timeout: 10_000 })),
  );
}

export function getBaseRpcUrls(isTestnet: boolean) {
  const configuredPrimary = readEnv(process.env.BASE_RPC_URL);
  const configuredFallbacks = splitCsv(readEnv(process.env.BASE_RPC_FALLBACK_URLS));
  const defaults = isTestnet ? BASE_SEPOLIA_RPC_URLS : BASE_MAINNET_RPC_URLS;

  return dedupeUrls([
    ...(configuredPrimary && !defaults.includes(configuredPrimary) ? [configuredPrimary] : []),
    ...configuredFallbacks,
    ...defaults,
  ]);
}

export async function getMaxPendingNonce(
  isTestnet: boolean,
  address: `0x${string}`,
) {
  const settled = await Promise.allSettled(
    getBaseRpcUrls(isTestnet).map(async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionCount',
          params: [address, 'pending'],
        }),
      });
      const payload = await response.json().catch(() => null) as
        | { result?: string; error?: { message?: string } }
        | null;

      if (!response.ok || !payload?.result) {
        throw new Error(payload?.error?.message ?? `Pending nonce query failed for ${url}`);
      }

      return Number.parseInt(payload.result, 16);
    }),
  );

  const nonces = settled
    .filter((result): result is PromiseFulfilledResult<number> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (nonces.length === 0) {
    const firstError = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    throw firstError?.reason instanceof Error
      ? firstError.reason
      : new Error('Failed to fetch a pending nonce from any Base RPC');
  }

  return Math.max(...nonces);
}

function splitCsv(value?: string) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dedupeUrls(urls: readonly string[]) {
  return Array.from(new Set(urls));
}
