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
const walletHarnessEnabled = process.env.NODE_ENV !== 'production';

type WalletUiEvent = {
  type: string;
  ts: number;
  walletId?: WalletId;
  connectorId?: string;
  connectorName?: string;
};

function pushWalletUiEvent(event: WalletUiEvent) {
  if (!walletHarnessEnabled || typeof window === 'undefined') {
    return;
  }

  const browserWindow = window as typeof window & {
    __ELIOS_WALLET_UI_EVENTS__?: WalletUiEvent[];
  };

  browserWindow.__ELIOS_WALLET_UI_EVENTS__ = [
    ...(browserWindow.__ELIOS_WALLET_UI_EVENTS__ ?? []),
    event,
  ];
}

export interface WalletOption {
  id: WalletId;
  name: string;
  installed: boolean;
  downloadUrl?: string;
}

export function useWallet() {
  const { connectors, connect, error: connectError, isPending } = useConnect();
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
    pushWalletUiEvent({ type: 'connectWallet', walletId, ts: Date.now() });

    if (isE2EMode) {
      writeE2EWalletState({ connected: true });
      return;
    }

    const connector = resolveWalletConnector(walletId, connectors);
    if (!connector) {
      pushWalletUiEvent({ type: 'connectWallet:no-connector', walletId, ts: Date.now() });
      return;
    }

    pushWalletUiEvent({
      type: 'connectWallet:connector',
      walletId,
      connectorId: connector.id,
      connectorName: connector.name,
      ts: Date.now(),
    });
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

  useEffect(() => {
    if (!walletHarnessEnabled || typeof window === 'undefined') {
      return;
    }

    (window as typeof window & { __ELIOS_WALLET_STATE__?: unknown }).__ELIOS_WALLET_STATE__ = {
      address: resolvedAddress,
      availableConnectors: connectors.map((connector) => ({
        id: connector.id,
        name: connector.name,
        type: connector.type,
      })),
      connectionAddress: connection.address,
      connectorId: connection.connector?.id,
      connectError: connectError?.message ?? null,
      isConnected: resolvedConnected,
      isConnecting: isE2EMode ? false : connection.isConnecting || isPending,
      installedWalletIds,
    };
  }, [
    connection.address,
    connection.connector?.id,
    connection.isConnecting,
    connectError?.message,
    connectors,
    installedWalletIds,
    isPending,
    resolvedAddress,
    resolvedConnected,
  ]);

  useEffect(() => {
    if (!walletHarnessEnabled || typeof window === 'undefined') {
      return;
    }

    const browserWindow = window as typeof window & {
      __ELIOS_CONNECT_WALLET__?: (walletId: WalletId) => void;
      __ELIOS_DISCONNECT_WALLET__?: () => void;
    };

    browserWindow.__ELIOS_CONNECT_WALLET__ = connectWallet;
    browserWindow.__ELIOS_DISCONNECT_WALLET__ = disconnectWallet;

    return () => {
      delete browserWindow.__ELIOS_CONNECT_WALLET__;
      delete browserWindow.__ELIOS_DISCONNECT_WALLET__;
    };
  }, [connectWallet, disconnectWallet]);

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
