'use client';

import { useState } from 'react';
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
            </div>
          </div>
        </AuthGate>
      </WalletProvider>
    </AuthProvider>
  );
}
