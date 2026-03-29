'use client';

import { useEffect, useRef, useState } from 'react';
import { isAddress } from 'viem';
import { ArrowUpRight, CheckCircle, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWalletTransfer } from '@/hooks/useWalletTransfer';
import { useAuthContext } from '@/providers/AuthProvider';
import { useWallet } from '@/hooks/useWallet';

type TransferStep = 'idle' | 'signing' | 'mining' | 'confirming' | 'sent' | 'error';

export default function WalletTransferCard() {
  const queryClient = useQueryClient();
  const { session } = useAuthContext();
  const { isConnected } = useWallet();
  const { transfer, txHash, isSigning, isMining, isConfirmed, error: contractError, reset } = useWalletTransfer();
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [step, setStep] = useState<TransferStep>('idle');
  const [error, setError] = useState('');
  const submittedHash = useRef<`0x${string}` | null>(null);

  useEffect(() => {
    if (isSigning && step === 'idle') setStep('signing');
    if (isMining && step === 'signing') setStep('mining');
  }, [isSigning, isMining, step]);

  useEffect(() => {
    if (!txHash || !isConfirmed || submittedHash.current === txHash) {
      return;
    }

    submittedHash.current = txHash;
    setStep('confirming');
    syncTransfer(txHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash]);

  useEffect(() => {
    if (!contractError || step === 'idle' || step === 'sent') {
      return;
    }

    const raw = contractError.message ?? '';
    let nextError = 'Something went wrong. Please try again.';
    if (raw.includes('User rejected') || raw.includes('user rejected')) {
      nextError = 'You cancelled the transaction.';
    } else if (raw.includes('insufficient funds') || raw.includes('exceeds balance')) {
      nextError = 'Insufficient funds for transfer or gas.';
    } else if (raw.includes('chain') || raw.includes('network')) {
      nextError = 'Please switch to Base network and try again.';
    }

    setError(nextError);
    setStep('error');
  }, [contractError, step]);

  function handleSubmit() {
    if (!session?.walletAddress) {
      setError('Sign in with your wallet first.');
      return;
    }

    const trimmedRecipient = recipient.trim();
    const trimmedAmount = amount.trim();
    const numericAmount = Number(trimmedAmount);

    if (!isConnected) {
      setError('Connect your wallet first.');
      return;
    }
    if (!isAddress(trimmedRecipient)) {
      setError('Enter a valid Base wallet address.');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a valid ETH amount.');
      return;
    }

    setError('');
    setStep('idle');
    submittedHash.current = null;
    reset();
    transfer(trimmedRecipient as `0x${string}`, trimmedAmount);
  }

  async function syncTransfer(hash: string) {
    try {
      const trimmedAmount = amount.trim();
      const trimmedRecipient = recipient.trim();
      const res = await fetch('/api/transactions/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment',
          from: session?.walletAddress,
          to: trimmedRecipient,
          amount: `${trimmedAmount} ETH`,
          token: 'ETH',
          txHash: hash,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '' }));
        setError(data.error || 'Failed to sync transfer');
        setStep('error');
        return;
      }

      setStep('sent');
      setAmount('');
      setRecipient('');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stats'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch {
      setError('Network error. Check your connection and try again.');
      setStep('error');
    }
  }

  const buttonLabel = {
    idle: 'Withdraw ETH',
    signing: 'Sign Tx...',
    mining: 'Mining...',
    confirming: 'Syncing...',
    sent: 'Sent',
    error: 'Retry',
  }[step];

  return (
    <div className="glass p-5 rounded-2xl">
      <div className="flex items-center gap-2">
        <ArrowUpRight size={16} className="text-white/50" />
        <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide">
          Withdraw ETH
        </h2>
      </div>
      <p className="mt-2 text-[11px] text-white/35 font-[family-name:var(--font-body)]">
        Sends native ETH from your connected Base wallet to any destination address.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-white/35">
            Destination
          </label>
          <input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="0x..."
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-white/25"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-white/35">
            Amount
          </label>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-white/25"
          />
        </div>

        {error ? (
          <p className="text-[11px] text-red-400">{error}</p>
        ) : null}

        <button
          onClick={handleSubmit}
          disabled={['signing', 'mining', 'confirming'].includes(step)}
          className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
            step === 'sent'
              ? 'border border-green-500/20 bg-green-500/15 text-green-400'
              : 'bg-white text-black hover:bg-white/90'
          } disabled:opacity-70`}
        >
          {step === 'sent' ? (
            <span className="flex items-center justify-center gap-2">
              <CheckCircle size={14} />
              {buttonLabel}
            </span>
          ) : ['signing', 'mining', 'confirming'].includes(step) ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {buttonLabel}
            </span>
          ) : (
            buttonLabel
          )}
        </button>
      </div>
    </div>
  );
}
