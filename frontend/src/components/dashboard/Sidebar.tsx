'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Store, ListChecks, Wallet, ShieldCheck, X } from 'lucide-react';
import { useAuthContext } from '@/providers/AuthProvider';
import { useMounted } from '@/hooks/useMounted';
import { useWallet } from '@/hooks/useWallet';

const navItems = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/marketplace', label: 'Marketplace', icon: Store },
  { href: '/app/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/app/wallet', label: 'Wallet', icon: Wallet },
  { href: '/app/security', label: 'Security', icon: ShieldCheck, privileged: true },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

function SidebarWalletStatus() {
  const { isConnected, shortAddress, walletName } = useWallet();
  const { isAuthenticated } = useAuthContext();
  const label = walletName ? `${walletName} · Base` : 'Base';

  if (!isConnected) {
    return (
      <div className="flex items-center gap-3 px-2">
        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-mono text-white/30">
          --
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/30">Not connected</p>
        </div>
        <div className="w-2 h-2 rounded-full bg-white/20" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-2">
      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-mono text-white/70">
        0x
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/70 font-[family-name:var(--font-mono)] truncate">
          {shortAddress}
        </p>
        <p className="text-[10px] text-white/40 truncate">{label}</p>
      </div>
      <div className={`w-2 h-2 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-yellow-500'}`} />
    </div>
  );
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { session } = useAuthContext();
  const mounted = useMounted();
  const canAccessSecurity = session?.role === 'admin' || session?.role === 'operator';
  const visibleNavItems = navItems.filter((item) => !item.privileged || canAccessSecurity);

  const isActive = (href: string) => {
    if (href === '/app') return pathname === '/app';
    return pathname.startsWith(href);
  };

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-60 glass border-r border-white/6 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-widest font-[family-name:var(--font-heading)]">
              <span className="text-white">ELIOS</span>
              <span className="text-white/60">BASE</span>
            </span>
          </Link>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-white/50 transition-colors hover:bg-white/8 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleNavItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive(href)
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={18} />
              <span className="font-[family-name:var(--font-body)]">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/6">
          {mounted ? (
            <SidebarWalletStatus />
          ) : (
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-mono text-white/30">
                --
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/30">Not connected</p>
              </div>
              <div className="w-2 h-2 rounded-full bg-white/20" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
