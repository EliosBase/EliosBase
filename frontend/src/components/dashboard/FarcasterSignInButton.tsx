'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSignIn } from '@farcaster/auth-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/providers/AuthProvider';

interface FarcasterSignInButtonProps {
  onClose?: () => void;
}

export default function FarcasterSignInButton({ onClose }: FarcasterSignInButtonProps) {
  const { refreshSession, setIsSigningIn } = useAuthContext();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const pendingVerify = useRef(false);

  const {
    signIn: startSignIn,
    isSuccess,
    data,
  } = useSignIn({
    onError: () => {
      setIsVerifying(false);
      setIsSigningIn(false);
    },
  });

  useEffect(() => {
    if (!isSuccess || !data || pendingVerify.current) return;
    pendingVerify.current = true;
    setIsVerifying(true);

    (async () => {
      try {
        const nonceRes = await fetch('/api/auth/farcaster/nonce');
        const { nonce } = await nonceRes.json();
        void nonce; // nonce is set in session server-side

        const verifyRes = await fetch('/api/auth/farcaster/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: data.message,
            signature: data.signature,
            fid: data.fid,
            username: data.username,
            pfpUrl: data.pfpUrl,
          }),
        });

        if (!verifyRes.ok) {
          const err = await verifyRes.json();
          throw new Error(err.error || 'Farcaster verification failed');
        }

        await refreshSession();
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['security-alerts'] });
        onClose?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Farcaster sign-in failed');
      } finally {
        setIsVerifying(false);
        setIsSigningIn(false);
        pendingVerify.current = false;
      }
    })();
  }, [isSuccess, data, refreshSession, setIsSigningIn, queryClient, onClose]);

  const handleClick = useCallback(() => {
    setError(null);
    setIsSigningIn(true);
    startSignIn();
  }, [startSignIn, setIsSigningIn]);

  return (
    <div className="mt-4 border-t border-white/8 pt-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/25 mb-2">Or sign in with</p>
      <button
        type="button"
        onClick={handleClick}
        disabled={isVerifying}
        className="w-full rounded-xl border border-purple-500/20 bg-purple-500/10 px-3 py-3 text-left transition-colors hover:bg-purple-500/15 disabled:opacity-50"
      >
        <span className="block text-sm font-medium text-purple-300">Farcaster</span>
        <span className="mt-1 block text-xs text-white/45">
          {isVerifying ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Verifying...
            </span>
          ) : (
            'Sign in with your Farcaster identity'
          )}
        </span>
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
