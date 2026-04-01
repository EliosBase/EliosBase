'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSignIn } from '@farcaster/auth-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/providers/AuthProvider';

export function useFarcasterAuth() {
  const { refreshSession, setIsSigningIn } = useAuthContext();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const pendingVerify = useRef(false);

  const {
    signIn: startFarcasterSignIn,
    isSuccess,
    isError,
    error: signInError,
    data,
  } = useSignIn({
    onSuccess: () => {
      // handled in the effect below
    },
    onError: () => {
      setIsSigningIn(false);
    },
  });

  // When auth-kit reports success, verify with our backend
  useEffect(() => {
    if (!isSuccess || !data || pendingVerify.current) return;
    pendingVerify.current = true;

    (async () => {
      try {
        // Fetch nonce — sets it in the server session for verification
        await fetch('/api/auth/farcaster/nonce');

        // auth-kit already verified in the client — forward to our server
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
        queryClient.invalidateQueries({ queryKey: ['guardrails'] });
        queryClient.invalidateQueries({ queryKey: ['audit-log'] });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Farcaster sign-in failed');
        console.error('Farcaster sign-in error:', err);
      } finally {
        setIsSigningIn(false);
        pendingVerify.current = false;
      }
    })();
  }, [isSuccess, data, refreshSession, setIsSigningIn, queryClient]);

  useEffect(() => {
    if (isError && signInError) {
      setError(signInError.message || 'Farcaster sign-in was cancelled');
    }
  }, [isError, signInError]);

  const signIn = useCallback(() => {
    setError(null);
    setIsSigningIn(true);
    startFarcasterSignIn();
  }, [startFarcasterSignIn, setIsSigningIn]);

  return { signIn, error, isSigningIn: false };
}
