import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  useWallet: vi.fn(),
  useMounted: vi.fn(),
  useSiweContext: vi.fn(),
  useAuthContext: vi.fn(),
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

vi.mock('./FarcasterSignInButton', () => ({
  default: () => null,
}));

const { default: DashboardHeader } = await import('@/components/dashboard/DashboardHeader');

describe('DashboardHeader', () => {
  it('keeps the pre-hydration wallet CTA stable', () => {
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
