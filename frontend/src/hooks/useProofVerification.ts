'use client';

import { useReadContract } from 'wagmi';
import { stringToHex } from 'viem';
import { VERIFIER_ABI, VERIFIER_CONTRACT_ADDRESS } from '@/lib/contracts';

export function useProofVerification(taskId: string) {
  const taskIdBytes32 = stringToHex(taskId, { size: 32 });

  const { data: isVerified, isLoading } = useReadContract({
    address: VERIFIER_CONTRACT_ADDRESS,
    abi: VERIFIER_ABI,
    functionName: 'isVerified',
    args: [taskIdBytes32],
    query: { refetchInterval: 10_000 },
  });

  return { isVerified: !!isVerified, isLoading };
}
