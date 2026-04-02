'use client';

import { useAppKit } from '@reown/appkit/react';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, LogOut, Menu } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useSiweContext } from '@/components/dashboard/AuthGate';
import { useMounted } from '@/hooks/useMounted';
import { useAuthContext } from '@/providers/AuthProvider';
import { isE2EMode, writeE2EWalletState } from '@/lib/e2e';
import { isAppKitEnabled } from '@/lib/wagmi';
import FarcasterSignInButton from './FarcasterSignInButton';
import type { WalletId } from '@/lib/wallets';

interface DashboardHeaderProps {
  title: string;
  onMenuClick: () => void;
}

export default function DashboardHeader({ title, onMenuClick }: DashboardHeaderProps) {
  const {
    isConnected,
    isConnecting,
    shortAddress,
    installedWallets,
    installableWallets,
    connect,
  } = useWallet();
  const { signOut } = useSiweContext();
  const { session } = useAuthContext();
  const mounted = useMounted();
  const forceConnectorE2E = process.env.NEXT_PUBLIC_WALLET_E2E_FORCE_CONNECTORS === '1';
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isWalletMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!walletMenuRef.current?.contains(event.target as Node)) {
        setIsWalletMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsWalletMenuOpen(false);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isWalletMenuOpen]);

  function handleConnectClick() {
    if (installedWallets.length === 1) {
      connect(installedWallets[0].id);
      return;
    }

    setIsWalletMenuOpen((open) => !open);
  }

  function handleWalletChoice(walletId: WalletId) {
    setIsWalletMenuOpen(false);
    connect(walletId);
  }

  const needsWalletMenu = installedWallets.length !== 1;
  const showConnecting = mounted && isConnecting;
  const showWalletMenuChevron = mounted && needsWalletMenu && !showConnecting;

  return (
    <header className="sticky top-0 z-30 border-b border-white/6 px-4 py-4 glass sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenuClick}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <h1 className="truncate text-lg font-semibold font-[family-name:var(--font-heading)] tracking-wide text-white">
          {title}
        </h1>
      </div>

      {mounted && isConnected ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {session?.fcUsername ? (
            <span className="inline-flex min-h-11 items-center rounded-xl border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-sm text-purple-300 font-[family-name:var(--font-body)]">
              @{session.fcUsername}
            </span>
          ) : process.env.NEXT_PUBLIC_FC_AUTH_ENABLED === 'true' ? (
            <LinkFarcasterButton />
          ) : null}
          <span className="inline-flex min-h-11 max-w-full items-center rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/80 font-[family-name:var(--font-mono)]">
            {shortAddress}
          </span>
          <button
            onClick={() => signOut()}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            title="Disconnect"
            aria-label="Disconnect wallet"
          >
            <LogOut size={16} />
          </button>
        </div>
      ) : (
        mounted && isAppKitEnabled && !forceConnectorE2E ? (
          <AppKitConnectTrigger disabled={showConnecting} isConnecting={showConnecting} />
        ) : (
          <div className="relative w-full sm:w-auto" ref={walletMenuRef}>
            <button
              type="button"
              onClick={handleConnectClick}
              disabled={!mounted || showConnecting}
              aria-expanded={isWalletMenuOpen}
              aria-haspopup="dialog"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-50 sm:w-auto"
            >
              <span>{showConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
              {showWalletMenuChevron ? <ChevronDown size={16} /> : null}
            </button>

            {isWalletMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+0.75rem)] z-20 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#0b0b10] p-4 shadow-2xl shadow-black/40 sm:left-auto sm:right-0">
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)]">
                    {installedWallets.length > 0 ? 'Connect Wallet' : 'Get a Wallet'}
                  </h2>
                  <p className="mt-1 text-xs text-white/45">
                    {installedWallets.length > 0
                      ? 'Choose a wallet to connect to Base.'
                      : 'Install a supported wallet to get started.'}
                  </p>
                </div>

                {installedWallets.length > 0 ? (
                  <div className="space-y-2">
                    {installedWallets.map((wallet) => (
                      <button
                        key={wallet.id}
                        type="button"
                        onClick={() => handleWalletChoice(wallet.id)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition-colors hover:bg-white/10"
                      >
                        <span className="block text-sm font-medium text-white">{wallet.name}</span>
                        <span className="mt-1 block text-xs text-white/45">Connect and sign in on Base</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {installableWallets.length > 0 ? (
                  <div className={`${installedWallets.length > 0 ? 'mt-4 border-t border-white/8 pt-4' : ''} space-y-2`}>
                    {installedWallets.length > 0 ? (
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/25">Install a wallet</p>
                    ) : null}
                    {installableWallets.map((wallet) => (
                      <a
                        key={wallet.id}
                        href={wallet.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/3 px-3 py-3 text-left transition-colors hover:bg-white/8"
                      >
                        <span>
                          <span className="block text-sm font-medium text-white">{wallet.name}</span>
                          <span className="mt-1 block text-xs text-white/45">Install wallet</span>
                        </span>
                        <ExternalLink size={14} className="text-white/35" />
                      </a>
                    ))}
                  </div>
                ) : null}

                {process.env.NEXT_PUBLIC_FC_AUTH_ENABLED === 'true' ? (
                  <FarcasterSignInButton onClose={() => setIsWalletMenuOpen(false)} />
                ) : null}
              </div>
            ) : null}
          </div>
        )
      )}
      </div>
    </header>
  );
}

function AppKitConnectTrigger({
  disabled,
  isConnecting,
}: {
  disabled: boolean;
  isConnecting: boolean;
}) {
  const { open } = useAppKit();

  function handleClick() {
    if (isE2EMode) {
      writeE2EWalletState({ connected: true });
      return;
    }

    open({ view: 'Connect' });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-50 sm:w-auto"
    >
      <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
    </button>
  );
}

function LinkFarcasterButton() {
  const [showLink, setShowLink] = useState(false);
  return (
    <>
      <button
        onClick={() => setShowLink(true)}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-purple-500/15 bg-purple-500/8 px-3 py-2 text-xs text-purple-400 transition-colors hover:bg-purple-500/15"
      >
        Link Farcaster
      </button>
      {showLink && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-20 backdrop-blur-sm sm:items-center sm:py-4">
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b10] p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-3">Link Farcaster Account</h3>
            <FarcasterSignInButton onClose={() => setShowLink(false)} />
            <button
              onClick={() => setShowLink(false)}
              className="mt-3 min-h-11 w-full rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/12"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
