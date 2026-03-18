'use client';

import { Menu, LogOut } from 'lucide-react';
import { usePhantom } from '@/hooks/usePhantom';
import { useSiweContext } from '@/components/dashboard/AuthGate';
import { useMounted } from '@/hooks/useMounted';

interface DashboardHeaderProps {
  title: string;
  onMenuClick: () => void;
}

export default function DashboardHeader({ title, onMenuClick }: DashboardHeaderProps) {
  const { isConnected, isConnecting, shortAddress, connect } = usePhantom();
  const { signOut } = useSiweContext();
  const mounted = useMounted();

  return (
    <header className="sticky top-0 z-30 glass border-b border-white/6 px-4 sm:px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 text-white/50 hover:text-white rounded-lg hover:bg-white/5"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold font-[family-name:var(--font-heading)] tracking-wide text-white">
          {title}
        </h1>
      </div>

      {mounted && isConnected ? (
        <div className="flex items-center gap-2">
          <span className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-sm text-white/80 font-[family-name:var(--font-mono)]">
            {shortAddress}
          </span>
          <button
            onClick={() => signOut()}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Disconnect"
          >
            <LogOut size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={!mounted || isConnecting}
          className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-50"
        >
          {isConnecting ? 'Connecting...' : 'Connect Phantom'}
        </button>
      )}
    </header>
  );
}
