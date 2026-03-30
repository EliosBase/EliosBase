'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import CyberBackground from '@/components/CyberBackground';
import Sidebar from '@/components/dashboard/Sidebar';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import TransactionSyncBridge from '@/components/dashboard/TransactionSyncBridge';
import WalletProvider from '@/providers/WalletProvider';
import AuthProvider from '@/providers/AuthProvider';
import AuthGate from '@/components/dashboard/AuthGate';

const pageTitles: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/marketplace': 'Agent Marketplace',
  '/app/tasks': 'Task Management',
  '/app/wallet': 'Wallet & Payments',
  '/app/security': 'Security Center',
};

const appFooterLinks = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Support', href: '/support' },
  { label: 'Security Policy', href: '/support#security' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const title = pageTitles[pathname] || 'Dashboard';

  return (
    <AuthProvider>
      <WalletProvider>
        <AuthGate>
          <TransactionSyncBridge />
          <div className="min-h-screen">
            <CyberBackground />
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <div className="lg:pl-60 min-h-screen flex flex-col">
              <DashboardHeader title={title} onMenuClick={() => setSidebarOpen(true)} />
              <main className="flex-1 p-4 sm:p-6 relative z-10">
                {children}
              </main>
              <footer className="relative z-10 border-t border-white/6 px-4 sm:px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/35">
                  <div className="flex flex-wrap items-center gap-3">
                    {appFooterLinks.map((link) => (
                      <Link key={link.label} href={link.href} className="hover:text-white transition-colors">
                        {link.label}
                      </Link>
                    ))}
                  </div>
                  <span>EliosBase public launch controls active</span>
                </div>
              </footer>
            </div>
          </div>
        </AuthGate>
      </WalletProvider>
    </AuthProvider>
  );
}
