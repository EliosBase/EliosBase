import { describe, expect, it } from 'vitest';
import { detectInstalledWallets, getInjectedProvider } from '@/lib/wallets';

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
});
