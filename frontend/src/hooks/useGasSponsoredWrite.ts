'use client';

import { useAccount } from 'wagmi';

/**
 * Detects if the connected wallet supports gas sponsorship (Coinbase Smart Wallet).
 * Returns true if the user's transactions will be gas-sponsored.
 */
export function useGasSponsored(): boolean {
  const { connector } = useAccount();

  // Coinbase Smart Wallet connector ID
  if (connector?.id === 'coinbaseWalletSDK') {
    return Boolean(process.env.NEXT_PUBLIC_CDP_API_KEY);
  }

  return false;
}
