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

const knownWallets = [
  { id: 'metaMask', name: 'MetaMask', downloadUrl: 'https://metamask.io/download/' },
  { id: 'coinbaseWallet', name: 'Coinbase Wallet', downloadUrl: 'https://www.coinbase.com/wallet/downloads' },
  { id: 'rabby', name: 'Rabby', downloadUrl: 'https://rabby.io/' },
  { id: 'phantom', name: 'Phantom', downloadUrl: 'https://phantom.com/download' },
] as const;

export type WalletId = (typeof knownWallets)[number]['id'] | 'injected' | 'browserWallet';

export interface WalletOption {
  id: WalletId;
  name: string;
  installed: boolean;
  downloadUrl?: string;
}

function getWalletName(id: string, fallback: string) {
  if (id === 'injected') return 'Browser Wallet';
  return knownWallets.find((wallet) => wallet.id === id)?.name ?? fallback;
}

export function useWallet() {
  const { connectors, connect, isPending } = useConnect();
  const connection = useConnection();
  const { disconnect } = useDisconnect();
  const [e2eState, setE2EState] = useState(() => readE2EWalletState());
  const [installedConnectorIds, setInstalledConnectorIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isE2EMode) return;
    return subscribeE2EWallet(() => {
      setE2EState(readE2EWalletState());
    });
  }, []);

  useEffect(() => {
    if (isE2EMode) return;

    let cancelled = false;

    async function resolveInstalledConnectors() {
      const installed = await Promise.all(
        connectors.map(async (connector) => {
          try {
            return (await connector.getProvider()) ? connector.id : null;
          } catch {
            return null;
          }
        }),
      );

      if (!cancelled) {
        setInstalledConnectorIds(installed.filter((id): id is string => !!id));
      }
    }

    resolveInstalledConnectors();

    return () => {
      cancelled = true;
    };
  }, [connectors]);

  const walletOptions = useMemo<WalletOption[]>(() => {
    if (isE2EMode) {
      return [{ id: 'browserWallet', name: 'Browser Wallet', installed: true }];
    }

    const installed = new Set(installedConnectorIds);
    const options: WalletOption[] = knownWallets.map((wallet) => ({
      ...wallet,
      installed: installed.has(wallet.id),
    }));

    if (installed.has('injected') && !options.some((wallet) => wallet.installed)) {
      options.push({
        id: 'injected',
        name: 'Browser Wallet',
        installed: true,
      });
    }

    return options;
  }, [installedConnectorIds]);

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

    const connectorId = walletId === 'browserWallet' ? 'injected' : walletId;
    const connector = connectors.find((entry) => entry.id === connectorId);
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
