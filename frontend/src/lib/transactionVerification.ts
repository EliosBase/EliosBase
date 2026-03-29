import type { Address, Hash } from 'viem';
import { publicClient } from '@/lib/viemClient';

type VerificationOptions = {
  expectedFrom?: Address | string;
  expectedTo?: Address | string;
};

type VerificationResult = {
  txStatus: 'confirmed' | 'pending';
  blockNumber: number | null;
};

export async function verifyOnchainTransaction(
  hash: Hash,
  options: VerificationOptions = {},
): Promise<VerificationResult> {
  const tx = await publicClient.getTransaction({ hash });

  if (options.expectedTo && tx.to?.toLowerCase() !== options.expectedTo.toLowerCase()) {
    throw new Error('Transaction is not to the escrow contract');
  }

  if (options.expectedFrom && tx.from.toLowerCase() !== options.expectedFrom.toLowerCase()) {
    throw new Error('Transaction sender does not match your wallet');
  }

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error('Transaction reverted on-chain');
    }

    return {
      txStatus: 'confirmed',
      blockNumber: Number(receipt.blockNumber),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Transaction reverted on-chain') {
      throw error;
    }

    return {
      txStatus: 'pending',
      blockNumber: null,
    };
  }
}
