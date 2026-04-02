'use client';

import { useConnect, useConnection, useDisconnect } from 'wagmi';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearE2EWalletState,
  isE2EMode,
  readE2EWalletState,
  subscribeE2EWallet,
  writeE2EWalletState,
} from '@/lib/e2e';
import {
  detectInstalledWallets,
  getWalletName,
  knownWallets,
  resolveWalletConnector,
  type WalletId,
} from '@/lib/wallets';

const launchWalletIds = new Set<WalletId>(['metaMask', 'coinbaseWallet', 'phantom', 'rabby']);

export interface WalletOption {
  id: WalletId;
  name: string;
  installed: boolean;
  downloadUrl?: string;
}

export function useWallet() {
  const { connectors, connect, isPending } = useConnect();
  const connection = useConnection();
  const { disconnect } = useDisconnect();
  const [e2eState, setE2EState] = useState(() => readE2EWalletState());
  const readInstalledWallets = useCallback(
    () => detectInstalledWallets(window as Parameters<typeof detectInstalledWallets>[0]),
    [],
  );
  const [installedWalletIds, setInstalledWalletIds] = useState<WalletId[]>(() => {
    if (isE2EMode || typeof window === 'undefined') return [];
    return readInstalledWallets();
  });

  useEffect(() => {
    if (!isE2EMode) return;
    return subscribeE2EWallet(() => {
      setE2EState(readE2EWalletState());
    });
  }, []);

  useEffect(() => {
    if (isE2EMode) return;

    const resolveInstalledWallets = () => {
      setInstalledWalletIds(readInstalledWallets());
    };

    resolveInstalledWallets();

    const timerIds = [250, 1000].map((delay) => window.setTimeout(resolveInstalledWallets, delay));

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') resolveInstalledWallets();
    };

    window.addEventListener('focus', resolveInstalledWallets);
    window.addEventListener('ethereum#initialized', resolveInstalledWallets);
    window.addEventListener('eip6963:announceProvider', resolveInstalledWallets as EventListener);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      window.removeEventListener('focus', resolveInstalledWallets);
      window.removeEventListener('ethereum#initialized', resolveInstalledWallets);
      window.removeEventListener('eip6963:announceProvider', resolveInstalledWallets as EventListener);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [readInstalledWallets]);

  const walletOptions = useMemo<WalletOption[]>(() => {
    if (isE2EMode) {
      return [{ id: 'browserWallet', name: 'Browser Wallet', installed: true }];
    }

    const installed = new Set(installedWalletIds);
    const alwaysAvailable = new Set<WalletId>(['coinbaseWallet']);
    const options: WalletOption[] = knownWallets
      .filter((wallet) => launchWalletIds.has(wallet.id))
      .map((wallet) => ({
        ...wallet,
        installed: installed.has(wallet.id) || alwaysAvailable.has(wallet.id),
      }));

    return options;
  }, [installedWalletIds]);

  const installedWallets = useMemo(
    () => walletOptions.filter((wallet) => wallet.installed),
    [walletOptions],
  );

  const installableWallets = useMemo(
    () => walletOptions.filter((wallet) => !wallet.installed && wallet.downloadUrl),
    [walletOptions],
  );

  const connectWallet = useCallback((walletId: WalletId) => {
    if (isE2EMode) {
      writeE2EWalletState({ connected: true });
      return;
    }

    const connector = resolveWalletConnector(walletId, connectors);
    if (!connector) return;

    connect({ connector });
  }, [connectors, connect]);

  const disconnectWallet = useCallback(() => {
    if (isE2EMode) {
      clearE2EWalletState();
      return;
    }

    disconnect();
  }, [disconnect]);

  const resolvedAddress = isE2EMode ? e2eState.address : connection.address;
  const resolvedConnected = isE2EMode ? e2eState.connected : connection.isConnected;
  const walletName = isE2EMode
    ? 'Browser Wallet'
    : connection.connector
      ? getWalletName(connection.connector.id, connection.connector.name)
      : null;

  const shortAddress = resolvedAddress
    ? `${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)}`
    : null;

  return {
    address: resolvedAddress,
    shortAddress,
    walletName,
    wallets: walletOptions,
    installedWallets,
    installableWallets,
    isConnected: resolvedConnected,
    isConnecting: isE2EMode ? false : connection.isConnecting || isPending,
    connect: connectWallet,
    disconnect: disconnectWallet,
  };
}
