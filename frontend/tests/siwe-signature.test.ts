import { describe, expect, it, vi } from 'vitest';
import { getConnectedInjectedProvider, signWithInjectedProvider } from '@/lib/siweSignature';

describe('getConnectedInjectedProvider', () => {
  it('prefers the matching phantom provider when both phantom and metamask exist', async () => {
    const metaMask = {
      isMetaMask: true,
      request: vi.fn(async ({ method }: { method: string }) => method === 'eth_accounts' ? ['0x0000000000000000000000000000000000000001'] : []),
    };
    const phantom = {
      isMetaMask: true,
      isPhantom: true,
      selectedAddress: '0x00000000000000000000000000000000000000AA',
      request: vi.fn(),
    };

    const provider = await getConnectedInjectedProvider({
      ethereum: { providers: [metaMask, phantom] },
      phantom: { ethereum: phantom },
    }, '0x00000000000000000000000000000000000000Aa');

    expect(provider).toBe(phantom);
  });

  it('falls back to the real metamask provider when it matches the connected address', async () => {
    const metaMask = {
      isMetaMask: true,
      selectedAddress: '0x00000000000000000000000000000000000000BB',
      request: vi.fn(),
    };
    const phantom = {
      isMetaMask: true,
      isPhantom: true,
      selectedAddress: '0x00000000000000000000000000000000000000AA',
      request: vi.fn(),
    };

    const provider = await getConnectedInjectedProvider({
      ethereum: { providers: [metaMask, phantom] },
      phantom: { ethereum: phantom },
    }, '0x00000000000000000000000000000000000000Bb');

    expect(provider).toBe(metaMask);
  });
});

describe('signWithInjectedProvider', () => {
  it('uses Phantom signMessage for SIWE payloads', async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'signMessage') {
        return 'phantom-signature';
      }

      return ['0x00000000000000000000000000000000000000AA'];
    });

    const signature = await signWithInjectedProvider({
      isMetaMask: true,
      isPhantom: true,
      request,
    }, '0x00000000000000000000000000000000000000AA', `example.com wants you to sign in with your Ethereum account:
0x00000000000000000000000000000000000000AA

Sign in to EliosBase
URI: http://127.0.0.1:34118
Version: 1
Chain ID: 8453
Nonce: abc123
Issued At: 2026-04-03T00:00:00.000Z`);

    expect(signature).toBe('phantom-signature');
    expect(request).toHaveBeenCalledWith({
      method: 'signMessage',
      params: {
        display: 'utf8',
        message: new TextEncoder().encode(`example.com wants you to sign in with your Ethereum account:
0x00000000000000000000000000000000000000AA

Sign in to EliosBase
URI: http://127.0.0.1:34118
Version: 1
Chain ID: 8453
Nonce: abc123
Issued At: 2026-04-03T00:00:00.000Z`),
      },
    });
  });

  it('falls back to personal_sign for non-SIWE phantom payloads', async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'personal_sign') {
        return 'phantom-signature';
      }

      return ['0x00000000000000000000000000000000000000AA'];
    });

    const signature = await signWithInjectedProvider({
      isMetaMask: true,
      isPhantom: true,
      request,
    }, '0x00000000000000000000000000000000000000AA', 'hello');

    expect(signature).toBe('phantom-signature');
    expect(request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: ['0x68656c6c6f', '0x00000000000000000000000000000000000000AA'],
    });
  });

  it('uses personal_sign for metamask-style providers', async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'personal_sign') {
        return 'metamask-signature';
      }

      return ['0x00000000000000000000000000000000000000BB'];
    });

    const signature = await signWithInjectedProvider({
      isMetaMask: true,
      request,
    }, '0x00000000000000000000000000000000000000BB', 'hello');

    expect(signature).toBe('metamask-signature');
    expect(request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: ['hello', '0x00000000000000000000000000000000000000BB'],
    });
  });
});
