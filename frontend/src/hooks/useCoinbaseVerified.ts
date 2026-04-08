'use client';

import { useReadContract } from 'wagmi';

const COINBASE_INDEXER = '0x2c7eE1E5f416dfF40054c27A62f7B357C4E8619C' as const;
const VERIFIED_ACCOUNT_SCHEMA = '0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9' as const;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

const INDEXER_ABI = [
  {
    type: 'function',
    name: 'getAttestationUid',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'schemaUid', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
] as const;

export function useCoinbaseVerified(walletAddress: string | undefined) {
  const { data: uid, isLoading } = useReadContract({
    address: COINBASE_INDEXER,
    abi: INDEXER_ABI,
    functionName: 'getAttestationUid',
    args: walletAddress ? [walletAddress as `0x${string}`, VERIFIED_ACCOUNT_SCHEMA] : undefined,
    query: {
      enabled: !!walletAddress,
      staleTime: 60 * 60 * 1000, // 1 hour
    },
  });

  const isVerified = !!uid && uid !== ZERO_BYTES32;

  return { isVerified, isLoading };
}
