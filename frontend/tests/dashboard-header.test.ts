import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  openAppKit: vi.fn(),
  useWallet: vi.fn(),
  useMounted: vi.fn(),
  useSiweContext: vi.fn(),
  useAuthContext: vi.fn(),
}));

const originalEnv = { ...process.env };

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({
    open: mocks.openAppKit,
  }),
}));

vi.mock('@/hooks/useWallet', () => ({
  useWallet: mocks.useWallet,
}));

vi.mock('@/hooks/useMounted', () => ({
  useMounted: mocks.useMounted,
}));

vi.mock('@/components/dashboard/AuthGate', () => ({
  useSiweContext: mocks.useSiweContext,
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuthContext: mocks.useAuthContext,
}));

vi.mock('@/lib/wagmi', () => ({
  isAppKitEnabled: true,
}));

vi.mock('./FarcasterSignInButton', () => ({
  default: () => null,
}));

const { default: DashboardHeader } = await import('@/components/dashboard/DashboardHeader');

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe('DashboardHeader', () => {
  it('uses the AppKit trigger by default when AppKit is enabled', () => {
    process.env = { ...originalEnv, NEXT_PUBLIC_WALLET_E2E_FORCE_CONNECTORS: undefined };
    mocks.useMounted.mockReturnValue(true);
    mocks.useSiweContext.mockReturnValue({ signOut: vi.fn() });
    mocks.useAuthContext.mockReturnValue({ session: null, isAuthenticated: false });
    mocks.useWallet.mockReturnValue({
      isConnected: false,
      isConnecting: false,
      shortAddress: null,
      installedWallets: [],
      installableWallets: [],
      connect: vi.fn(),
    });

    const html = renderToStaticMarkup(
      createElement(DashboardHeader, {
        title: 'Dashboard',
        onMenuClick: vi.fn(),
      }),
    );

    expect(html).toContain('Connect Wallet');
    expect(html).not.toContain('aria-haspopup="dialog"');
  });

  it('prefers the direct wallet menu when installed wallets are detected', () => {
    process.env = { ...originalEnv, NEXT_PUBLIC_WALLET_E2E_FORCE_CONNECTORS: undefined };
    mocks.useMounted.mockReturnValue(true);
    mocks.useSiweContext.mockReturnValue({ signOut: vi.fn() });
    mocks.useAuthContext.mockReturnValue({ session: null, isAuthenticated: false });
    mocks.useWallet.mockReturnValue({
      isConnected: false,
      isConnecting: false,
      shortAddress: null,
      installedWallets: [
        { id: 'coinbaseWallet', name: 'Coinbase Wallet', installed: true },
        { id: 'metaMask', name: 'MetaMask', installed: true },
      ],
      installableWallets: [],
      connect: vi.fn(),
    });

    const html = renderToStaticMarkup(
      createElement(DashboardHeader, {
        title: 'Dashboard',
        onMenuClick: vi.fn(),
      }),
    );

    expect(html).toContain('Connect Wallet');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it('forces the direct connector menu in wallet E2E mode', () => {
    process.env = { ...originalEnv, NEXT_PUBLIC_WALLET_E2E_FORCE_CONNECTORS: '1' };
    mocks.useMounted.mockReturnValue(true);
    mocks.useSiweContext.mockReturnValue({ signOut: vi.fn() });
    mocks.useAuthContext.mockReturnValue({ session: null, isAuthenticated: false });
    mocks.useWallet.mockReturnValue({
      isConnected: false,
      isConnecting: false,
      shortAddress: null,
      installedWallets: [
        { id: 'metaMask', name: 'MetaMask', installed: true },
        { id: 'phantom', name: 'Phantom', installed: true },
      ],
      installableWallets: [],
      connect: vi.fn(),
    });

    const html = renderToStaticMarkup(
      createElement(DashboardHeader, {
        title: 'Dashboard',
        onMenuClick: vi.fn(),
      }),
    );

    expect(html).toContain('Connect Wallet');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it('keeps the pre-hydration wallet CTA stable', () => {
    process.env = { ...originalEnv, NEXT_PUBLIC_WALLET_E2E_FORCE_CONNECTORS: undefined };
    mocks.useMounted.mockReturnValue(false);
    mocks.useSiweContext.mockReturnValue({ signOut: vi.fn() });
    mocks.useAuthContext.mockReturnValue({ session: null, isAuthenticated: false });
    mocks.useWallet.mockReturnValue({
      isConnected: false,
      isConnecting: true,
      shortAddress: null,
      installedWallets: [],
      installableWallets: [],
      connect: vi.fn(),
    });

    const html = renderToStaticMarkup(
      createElement(DashboardHeader, {
        title: 'Dashboard',
        onMenuClick: vi.fn(),
      }),
    );

    expect(html).toContain('Connect Wallet');
    expect(html).not.toContain('Connecting...');
  });

  it('shows the active connection state after mount', () => {
    process.env = { ...originalEnv, NEXT_PUBLIC_WALLET_E2E_FORCE_CONNECTORS: undefined };
    mocks.useMounted.mockReturnValue(true);
    mocks.useSiweContext.mockReturnValue({ signOut: vi.fn() });
    mocks.useAuthContext.mockReturnValue({ session: null, isAuthenticated: false });
    mocks.useWallet.mockReturnValue({
      isConnected: false,
      isConnecting: true,
      shortAddress: null,
      installedWallets: [],
      installableWallets: [],
      connect: vi.fn(),
    });

    const html = renderToStaticMarkup(
      createElement(DashboardHeader, {
        title: 'Dashboard',
        onMenuClick: vi.fn(),
      }),
    );

    expect(html).toContain('Connecting...');
  });
});
