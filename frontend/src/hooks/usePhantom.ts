'use client';

import { useConnect, useAccount, useDisconnect } from 'wagmi';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearE2EWalletState,
  isE2EMode,
  readE2EWalletState,
  subscribeE2EWallet,
  writeE2EWalletState,
} from '@/lib/e2e';

type BrowserWalletWindow = Window & {
  ethereum?: unknown;
  phantom?: {
    ethereum?: unknown;
  };
};

export function usePhantom() {
  const { connectors, connect } = useConnect();
  const { address, isConnected, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const [e2eState, setE2EState] = useState(() => readE2EWalletState());

  useEffect(() => {
    if (!isE2EMode) return;
    return subscribeE2EWallet(() => {
      setE2EState(readE2EWalletState());
    });
  }, []);

  const phantomConnector = useMemo(
    () => connectors.find((c) => c.id === 'phantom'),
    [connectors]
  );

  const connectPhantom = useCallback(() => {
    if (isE2EMode) {
      writeE2EWalletState({ connected: true });
      return;
    }

    const walletWindow = typeof window !== 'undefined'
      ? (window as BrowserWalletWindow)
      : undefined;
    const injectedProvider = walletWindow
      ? walletWindow.phantom?.ethereum ?? walletWindow.ethereum
      : undefined;

    if (phantomConnector && injectedProvider) {
      connect({ connector: phantomConnector });
    } else {
      window.open('https://phantom.app/', '_blank');
    }
  }, [phantomConnector, connect]);

  const disconnectWallet = useCallback(() => {
    if (isE2EMode) {
      clearE2EWalletState();
      return;
    }

    disconnect();
  }, [disconnect]);

  const resolvedAddress = isE2EMode ? e2eState.address : address;
  const resolvedConnected = isE2EMode ? e2eState.connected : isConnected;

  const shortAddress = resolvedAddress
    ? `${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)}`
    : null;

  return {
    address: resolvedAddress,
    shortAddress,
    isConnected: resolvedConnected,
    isConnecting: isE2EMode ? false : isConnecting,
    isPhantomAvailable: isE2EMode ? true : !!phantomConnector,
    connect: connectPhantom,
    disconnect: disconnectWallet,
  };
}
