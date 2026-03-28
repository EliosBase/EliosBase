'use client';

import { useEffect, useRef, useState } from 'react';
import { parseEther } from 'viem';
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { isE2EMode, readE2EWalletState } from '@/lib/e2e';

function useE2ETransfer() {
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [isSigning, setIsSigning] = useState(false);
  const [isMining, setIsMining] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
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

export function useWalletTransfer() {
  const e2eTransfer = useE2ETransfer();
  const { sendTransaction, data: txHash, error: writeError, isPending: isSigning, reset } = useSendTransaction();
  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  function transfer(to: `0x${string}`, amount: string) {
    if (isE2EMode) {
      e2eTransfer.start();
      return;
    }

    sendTransaction({
      to,
      value: parseEther(amount),
    });
  }

  return {
    transfer,
    txHash: isE2EMode ? e2eTransfer.txHash : txHash,
    isSigning: isE2EMode ? e2eTransfer.isSigning : isSigning,
    isMining: isE2EMode ? e2eTransfer.isMining : isMining,
    isConfirmed: isE2EMode ? e2eTransfer.isConfirmed : isConfirmed,
    error: isE2EMode ? e2eTransfer.error : writeError,
    reset: isE2EMode ? e2eTransfer.reset : reset,
  };
}
