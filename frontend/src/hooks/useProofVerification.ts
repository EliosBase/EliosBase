'use client';

import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { stringToHex } from 'viem';
import { VERIFIER_ABI, VERIFIER_CONTRACT_ADDRESS } from '@/lib/contracts';
import { isE2EMode, readE2EVerifiedTasks, subscribeE2EProofs } from '@/lib/e2e';

export function useProofVerification(taskId: string) {
  const [e2eVerified, setE2EVerified] = useState(() => readE2EVerifiedTasks().includes(taskId));
  const taskIdBytes32 = stringToHex(taskId, { size: 32 });

  useEffect(() => {
    if (!isE2EMode) return;
    return subscribeE2EProofs(() => {
      setE2EVerified(readE2EVerifiedTasks().includes(taskId));
    });
  }, [taskId]);

  const { data: isVerified, isLoading } = useReadContract({
    address: VERIFIER_CONTRACT_ADDRESS,
    abi: VERIFIER_ABI,
    functionName: 'isVerified',
    args: [taskIdBytes32],
    query: { enabled: !isE2EMode, refetchInterval: 10_000 },
  });

  if (isE2EMode) {
    return { isVerified: e2eVerified, isLoading: false };
  }

  return { isVerified: !!isVerified, isLoading };
}
