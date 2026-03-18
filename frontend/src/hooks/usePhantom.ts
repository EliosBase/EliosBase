'use client';

import { useConnect, useAccount, useDisconnect } from 'wagmi';
import { useCallback, useMemo } from 'react';

export function usePhantom() {
  const { connectors, connect } = useConnect();
  const { address, isConnected, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();

  // Find the Phantom injected connector
  const phantomConnector = useMemo(
    () => connectors.find((c) => c.id === 'app.phantom'),
    [connectors]
  );

  const connectPhantom = useCallback(() => {
    if (phantomConnector) {
      connect({ connector: phantomConnector });
    } else {
      window.open('https://phantom.app/', '_blank');
    }
  }, [phantomConnector, connect]);

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  return {
    address,
    shortAddress,
    isConnected,
    isConnecting,
    isPhantomAvailable: !!phantomConnector,
    connect: connectPhantom,
    disconnect,
  };
}
