'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAccount, useSignMessage, useDisconnect, useSwitchChain } from 'wagmi';
import { SiweMessage } from 'siwe';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/providers/AuthProvider';
import { clearE2EWalletState, isE2EMode } from '@/lib/e2e';
import { activeChain } from '@/lib/wagmi';

export function useSiwe() {
  const { address, isConnected, isReconnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const {
    isAuthenticated,
    isSessionLoading,
    isSigningIn,
    setIsSigningIn,
    refreshSession,
  } = useAuthContext();
  const hasAutoTriggered = useRef(false);

  const signIn = useCallback(async () => {
    if (isE2EMode) {
      await refreshSession();
      return;
    }

    if (!address || isSigningIn) return;
    setIsSigningIn(true);
    try {
      await switchChainAsync({ chainId: activeChain.id });

      const nonceRes = await fetch('/api/auth/nonce');
      const { nonce } = await nonceRes.json();

      const message = new SiweMessage({
        domain: window.location.host,
        address: address,
        statement: 'Sign in to EliosBase',
        uri: window.location.origin,
        version: '1',
        chainId: activeChain.id,
        nonce,
      });
      const messageStr = message.prepareMessage();

      const signature = await signMessageAsync({ message: messageStr });

      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageStr, signature }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Verification failed');
      }

      await refreshSession();
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['security-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['guardrails'] });
      queryClient.invalidateQueries({ queryKey: ['audit-log'] });
    } catch (err) {
      console.error('Sign in failed:', err);
      hasAutoTriggered.current = false;
    } finally {
      setIsSigningIn(false);
    }
  }, [address, isSigningIn, signMessageAsync, switchChainAsync, refreshSession, setIsSigningIn, queryClient]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    if (isE2EMode) {
      clearE2EWalletState();
    } else {
      disconnect();
    }
    hasAutoTriggered.current = false;
    await refreshSession();
  }, [disconnect, refreshSession]);

  // Auto-logout when wallet address changes (user switched accounts)
  const { session } = useAuthContext();
  useEffect(() => {
    if (
      isAuthenticated &&
      address &&
      session?.walletAddress &&
      address.toLowerCase() !== session.walletAddress.toLowerCase()
    ) {
      // Wallet changed — invalidate old session
      hasAutoTriggered.current = false;
      fetch('/api/auth/logout', { method: 'POST' }).then(() => refreshSession());
    }
  }, [address, isAuthenticated, session?.walletAddress, refreshSession]);

  // Auto-trigger SIWE after fresh wallet connect
  useEffect(() => {
    if (
      isConnected &&
      address &&
      !isAuthenticated &&
      !isSessionLoading &&
      !isReconnecting &&
      !isSigningIn &&
      !hasAutoTriggered.current
    ) {
      hasAutoTriggered.current = true;
      signIn();
    }
  }, [isConnected, address, isAuthenticated, isSessionLoading, isReconnecting, isSigningIn, signIn]);

  return { signIn, signOut };
}
