'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, LogOut, Menu } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useSiweContext } from '@/components/dashboard/AuthGate';
import { useMounted } from '@/hooks/useMounted';
import { useAuthContext } from '@/providers/AuthProvider';
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
    <header className="sticky top-0 z-30 glass border-b border-white/6 px-4 sm:px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 text-white/50 hover:text-white rounded-lg hover:bg-white/5"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold font-[family-name:var(--font-heading)] tracking-wide text-white">
          {title}
        </h1>
      </div>

      {mounted && isConnected ? (
        <div className="flex items-center gap-2">
          {session?.fcUsername && (
            <span className="px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300 font-[family-name:var(--font-body)]">
              @{session.fcUsername}
            </span>
          )}
          <span className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-sm text-white/80 font-[family-name:var(--font-mono)]">
            {shortAddress}
          </span>
          <button
            onClick={() => signOut()}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Disconnect"
            aria-label="Disconnect wallet"
          >
            <LogOut size={16} />
          </button>
        </div>
      ) : (
        <div className="relative" ref={walletMenuRef}>
          <button
            type="button"
            onClick={handleConnectClick}
            disabled={!mounted || showConnecting}
            aria-expanded={isWalletMenuOpen}
            aria-haspopup="dialog"
            className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            <span>{showConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
            {showWalletMenuChevron ? <ChevronDown size={16} /> : null}
          </button>

          {isWalletMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-20 w-80 rounded-2xl border border-white/10 bg-[#0b0b10] p-4 shadow-2xl shadow-black/40">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)]">
                  {installedWallets.length > 0 ? 'Connect MetaMask' : 'Install MetaMask'}
                </h2>
                <p className="mt-1 text-xs text-white/45">
                  {installedWallets.length > 0
                    ? 'MetaMask on Base is the launch-certified wallet path.'
                    : 'MetaMask is required for the current launch flow.'}
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
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/25">Need MetaMask?</p>
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
      )}
    </header>
  );
}
