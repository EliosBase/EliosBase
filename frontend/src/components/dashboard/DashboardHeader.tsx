'use client';

import { Menu } from 'lucide-react';

interface DashboardHeaderProps {
  title: string;
  onMenuClick: () => void;
}

export default function DashboardHeader({ title, onMenuClick }: DashboardHeaderProps) {
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

      <button className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-sm text-white/80 hover:bg-white/15 transition-colors font-[family-name:var(--font-body)]">
        0x7a3b...f8e2
      </button>
    </header>
  );
}
