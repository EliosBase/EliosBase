import { describe, expect, it } from 'vitest';
import { detectInstalledWallets, getInjectedProvider, resolveWalletConnector } from '@/lib/wallets';

describe('detectInstalledWallets', () => {
  it('detects MetaMask and Phantom when both are installed', () => {
    const metaMask = { isMetaMask: true };
    const phantom = { isMetaMask: true, isPhantom: true };

    expect(
      detectInstalledWallets({
        ethereum: { providers: [metaMask] },
        phantom: { ethereum: phantom },
      }),
    ).toEqual(['metaMask', 'phantom']);
  });

  it('does not mistake Phantom for MetaMask', () => {
    const phantom = { isMetaMask: true, isPhantom: true };

    expect(
      detectInstalledWallets({
        ethereum: phantom,
        phantom: { ethereum: phantom },
      }),
    ).toEqual(['phantom']);
  });

  it('falls back to a generic browser wallet when only an unknown provider exists', () => {
    expect(
      detectInstalledWallets({
        ethereum: { providers: [{}] },
      }),
    ).toEqual(['injected']);
  });

  it('resolves the real MetaMask provider when Phantom also injects ethereum', () => {
    const metaMask = { isMetaMask: true };
    const phantom = { isMetaMask: true, isPhantom: true };

    expect(
      getInjectedProvider({
        ethereum: { providers: [metaMask, phantom] },
        phantom: { ethereum: phantom },
      }, 'metaMask'),
    ).toBe(metaMask);
  });

  it('matches wallet connectors by normalized id and name', () => {
    const connectors = [
      { id: 'io.metamask', name: 'MetaMask' },
      { id: 'coinbaseWalletSDK', name: 'Coinbase Wallet' },
      { id: 'phantom', name: 'Phantom' },
      { id: 'rabby', name: 'Rabby Wallet' },
      { id: 'injected', name: 'Injected' },
    ];

    expect(resolveWalletConnector('metaMask', connectors)).toBe(connectors[0]);
    expect(resolveWalletConnector('coinbaseWallet', connectors)).toBe(connectors[1]);
    expect(resolveWalletConnector('phantom', connectors)).toBe(connectors[2]);
    expect(resolveWalletConnector('rabby', connectors)).toBe(connectors[3]);
    expect(resolveWalletConnector('browserWallet', connectors)).toBe(connectors[4]);
  });
});
