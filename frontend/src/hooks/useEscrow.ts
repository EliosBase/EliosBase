'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, stringToHex } from 'viem';
import { ESCROW_ABI, ESCROW_CONTRACT_ADDRESS } from '@/lib/contracts';
import { parseRewardAmount } from '@/lib/audit';

/**
 * Encode a string ID (e.g. "task-abc123") to bytes32 for the contract.
 */
function toBytes32(value: string): `0x${string}` {
  return stringToHex(value, { size: 32 });
}

/**
 * Hook for locking funds in the escrow contract.
 * Returns write function + transaction tracking state.
 */
export function useEscrowLock() {
  const { writeContract, data: txHash, isPending: isSigning, error: writeError, reset } = useWriteContract();

  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  function lock(taskId: string, agentId: string, amountStr: string) {
    const ethAmount = parseRewardAmount(amountStr);
    if (ethAmount <= 0) return;

    writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'lockFunds',
      args: [toBytes32(taskId), toBytes32(agentId)],
      value: parseEther(ethAmount.toString()),
    });
  }

  return {
    lock,
    txHash,
    isSigning,
    isMining,
    isConfirmed,
    error: writeError,
    reset,
  };
}

/**
 * Hook for releasing escrowed funds to a recipient.
 */
export function useEscrowRelease() {
  const { writeContract, data: txHash, isPending: isSigning, error: writeError, reset } = useWriteContract();

  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  function release(taskId: string, recipient: `0x${string}`) {
    writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'releaseFunds',
      args: [toBytes32(taskId), recipient],
    });
  }

  return { release, txHash, isSigning, isMining, isConfirmed, error: writeError, reset };
}

/**
 * Hook for refunding escrowed funds back to the depositor.
 */
export function useEscrowRefund() {
  const { writeContract, data: txHash, isPending: isSigning, error: writeError, reset } = useWriteContract();

  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  function refundFunds(taskId: string) {
    writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'refund',
      args: [toBytes32(taskId)],
    });
  }

  return { refundFunds, txHash, isSigning, isMining, isConfirmed, error: writeError, reset };
}
