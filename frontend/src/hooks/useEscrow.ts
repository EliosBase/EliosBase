'use client';

import { useEffect, useRef, useState } from 'react';
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEther, stringToHex } from 'viem';
import { ESCROW_ABI, ESCROW_CONTRACT_ADDRESS } from '@/lib/contracts';
import { parseRewardAmount } from '@/lib/audit';
import { isE2EMode, readE2EWalletState } from '@/lib/e2e';

/**
 * Encode a string ID (e.g. "task-abc123") to bytes32 for the contract.
 */
function toBytes32(value: string): `0x${string}` {
  return stringToHex(value, { size: 32 });
}

const escrowStates = ['None', 'Locked', 'Released', 'Refunded'] as const;

export type EscrowState = (typeof escrowStates)[number];

function useE2ETransaction() {
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [isSigning, setIsSigning] = useState(false);
  const [isMining, setIsMining] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function reset() {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setTxHash(undefined);
    setIsSigning(false);
    setIsMining(false);
    setIsConfirmed(false);
    setError(null);
  }

  function start() {
    const wallet = readE2EWalletState();
    if (!wallet.connected) {
      setError(new Error('Wallet not connected'));
      return;
    }

    reset();
    const nextHash = `0x${Date.now().toString(16).padEnd(64, '0').slice(0, 64)}` as `0x${string}`;
    setTxHash(nextHash);
    setIsSigning(true);

    timers.current.push(window.setTimeout(() => {
      setIsSigning(false);
      setIsMining(true);
    }, 75));

    timers.current.push(window.setTimeout(() => {
      setIsMining(false);
      setIsConfirmed(true);
    }, 175));
  }

  return { txHash, isSigning, isMining, isConfirmed, error, reset, start };
}

/**
 * Hook for locking funds in the escrow contract.
 * Returns write function + transaction tracking state.
 */
export function useEscrowLock() {
  const e2eTx = useE2ETransaction();
  const { writeContract, data: txHash, isPending: isSigning, error: writeError, reset } = useWriteContract();

  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  function lock(taskId: string, agentId: string, amountStr: string) {
    const ethAmount = parseRewardAmount(amountStr);
    if (ethAmount <= 0) return;

    if (isE2EMode) {
      e2eTx.start();
      return;
    }

    writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'lockFunds',
      args: [toBytes32(taskId), toBytes32(agentId)],
      value: parseEther(ethAmount.toFixed(18)),
    });
  }

  return {
    lock,
    txHash: isE2EMode ? e2eTx.txHash : txHash,
    isSigning: isE2EMode ? e2eTx.isSigning : isSigning,
    isMining: isE2EMode ? e2eTx.isMining : isMining,
    isConfirmed: isE2EMode ? e2eTx.isConfirmed : isConfirmed,
    error: isE2EMode ? e2eTx.error : writeError,
    reset: isE2EMode ? e2eTx.reset : reset,
  };
}

/**
 * Hook for releasing escrowed funds to a recipient.
 */
export function useEscrowRelease() {
  const e2eTx = useE2ETransaction();
  const { writeContract, data: txHash, isPending: isSigning, error: writeError, reset } = useWriteContract();

  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  function release(taskId: string, recipient: `0x${string}`) {
    if (isE2EMode) {
      e2eTx.start();
      return;
    }

    writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'releaseFunds',
      args: [toBytes32(taskId), recipient],
    });
  }

  return {
    release,
    txHash: isE2EMode ? e2eTx.txHash : txHash,
    isSigning: isE2EMode ? e2eTx.isSigning : isSigning,
    isMining: isE2EMode ? e2eTx.isMining : isMining,
    isConfirmed: isE2EMode ? e2eTx.isConfirmed : isConfirmed,
    error: isE2EMode ? e2eTx.error : writeError,
    reset: isE2EMode ? e2eTx.reset : reset,
  };
}

/**
 * Hook for refunding escrowed funds back to the depositor.
 */
export function useEscrowRefund() {
  const e2eTx = useE2ETransaction();
  const { writeContract, data: txHash, isPending: isSigning, error: writeError, reset } = useWriteContract();

  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  function refundFunds(taskId: string) {
    if (isE2EMode) {
      e2eTx.start();
      return;
    }

    writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'refund',
      args: [toBytes32(taskId)],
    });
  }

  return {
    refundFunds,
    txHash: isE2EMode ? e2eTx.txHash : txHash,
    isSigning: isE2EMode ? e2eTx.isSigning : isSigning,
    isMining: isE2EMode ? e2eTx.isMining : isMining,
    isConfirmed: isE2EMode ? e2eTx.isConfirmed : isConfirmed,
    error: isE2EMode ? e2eTx.error : writeError,
    reset: isE2EMode ? e2eTx.reset : reset,
  };
}

export function useEscrowStatus(taskId: string) {
  const taskIdBytes = toBytes32(taskId);
  const e2eWallet = readE2EWalletState();
  const contract = useReadContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'getEscrow',
    args: [taskIdBytes],
    query: {
      enabled: !isE2EMode && ESCROW_CONTRACT_ADDRESS !== '0x',
    },
  });

  if (isE2EMode) {
    return {
      amount: 0n,
      depositor: e2eWallet.address as `0x${string}`,
      state: (e2eWallet.connected ? 'Locked' : 'None') as EscrowState,
      isLoading: false,
    };
  }

  const data = contract.data as readonly [`0x${string}`, `0x${string}`, bigint, number] | undefined;
  const [depositor = '0x0000000000000000000000000000000000000000', , amount = 0n, stateValue = 0] = data ?? [];

  return {
    amount,
    depositor,
    isLoading: contract.isLoading,
    state: escrowStates[stateValue] ?? 'None',
  };
}
