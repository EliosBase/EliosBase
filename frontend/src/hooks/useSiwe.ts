'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAccount, useSignMessage, useDisconnect, useSwitchChain } from 'wagmi';
import { SiweMessage } from 'siwe';
import { useQueryClient } from '@tanstack/react-query';
import { getAddress } from 'viem';
import { useAuthContext } from '@/providers/AuthProvider';
import { clearE2EWalletState, isE2EMode } from '@/lib/e2e';
import { activeChain } from '@/lib/wagmi';
import { getConnectedInjectedProvider, signWithInjectedProvider } from '@/lib/siweSignature';

const skipWalletE2EChainSwitch = process.env.NEXT_PUBLIC_WALLET_E2E_SKIP_CHAIN_SWITCH === '1';
const walletHarnessEnabled = process.env.NODE_ENV !== 'production';

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function signSiweMessage(
  address: string,
  message: string,
  signMessageAsync: (args: { message: string }) => Promise<string>,
) {
  const injectedProvider = await getConnectedInjectedProvider(window, address);
  if (injectedProvider) {
    if (injectedProvider.isPhantom) {
      await delay(1_500);
    }

    if (walletHarnessEnabled) {
      (window as typeof window & { __ELIOS_SIWE_SIGN_PATH__?: string }).__ELIOS_SIWE_SIGN_PATH__ =
        injectedProvider.isPhantom
          ? 'injected:phantom'
          : injectedProvider.isMetaMask
            ? 'injected:metamask'
            : injectedProvider.isCoinbaseWallet
              ? 'injected:coinbase'
              : 'injected:unknown';
    }

    const signature = await signWithInjectedProvider(injectedProvider, address, message);
    if (signature) {
      return signature;
    }
  }

  if (walletHarnessEnabled) {
    (window as typeof window & { __ELIOS_SIWE_SIGN_PATH__?: string }).__ELIOS_SIWE_SIGN_PATH__ = 'wagmi';
  }

  return signMessageAsync({ message });
}

export function useSiwe() {
  const { address, chainId, isConnected, isReconnecting } = useAccount();
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
      if (!skipWalletE2EChainSwitch && chainId !== activeChain.id) {
        await switchChainAsync({ chainId: activeChain.id });
      }

      const nonceRes = await fetch('/api/auth/nonce');
      const { nonce } = await nonceRes.json();
      const checksumAddress = getAddress(address);

      const message = new SiweMessage({
        domain: window.location.host,
        address: checksumAddress,
        statement: 'Sign in to EliosBase',
        uri: window.location.origin,
        version: '1',
        chainId: activeChain.id,
        nonce,
      });
      const messageStr = message.prepareMessage();
      if (walletHarnessEnabled && typeof window !== 'undefined') {
        (window as typeof window & { __ELIOS_SIWE_MESSAGE__?: string }).__ELIOS_SIWE_MESSAGE__ = messageStr;
      }

      const signature = await signSiweMessage(
        checksumAddress,
        messageStr,
        signMessageAsync,
      );

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
  }, [
    address,
    chainId,
    isSigningIn,
    queryClient,
    refreshSession,
    setIsSigningIn,
    signMessageAsync,
    switchChainAsync,
  ]);

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
    if (!walletHarnessEnabled || typeof window === 'undefined') {
      return;
    }

    (window as typeof window & { __ELIOS_SIWE_STATE__?: unknown }).__ELIOS_SIWE_STATE__ = {
      address,
      isAuthenticated,
      isConnected,
      isReconnecting,
      isSessionLoading,
      isSigningIn,
    };
  }, [address, isAuthenticated, isConnected, isReconnecting, isSessionLoading, isSigningIn]);

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
  }, [
    address,
    isAuthenticated,
    isConnected,
    isReconnecting,
    isSessionLoading,
    isSigningIn,
    signIn,
  ]);

  return { signIn, signOut };
}
