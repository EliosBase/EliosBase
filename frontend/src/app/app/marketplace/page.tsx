'use client';

import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import SearchBar from '@/components/dashboard/SearchBar';
import AgentCard from '@/components/dashboard/AgentCard';
import AgentRegisterModal from '@/components/dashboard/AgentRegisterModal';
import { useAgents } from '@/hooks/useAgents';
import { useAuthContext } from '@/providers/AuthProvider';

export default function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const { data: agents = [], isLoading, isError, refetch } = useAgents();
  const { isAuthenticated } = useAuthContext();

  const allCapabilities = useMemo(
    () => Array.from(new Set(agents.flatMap((a) => a.capabilities))).sort(),
    [agents]
  );

  const filtered = useMemo(() => {
    return agents.filter((agent) => {
      const matchesSearch =
        !search ||
        agent.name.toLowerCase().includes(search.toLowerCase()) ||
        agent.description.toLowerCase().includes(search.toLowerCase());
      const matchesFilter =
        !activeFilter || agent.capabilities.includes(activeFilter);
      return matchesSearch && matchesFilter;
    });
  }, [agents, search, activeFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-white/40 text-sm font-[family-name:var(--font-body)]">Failed to load agents.</p>
        <button onClick={() => refetch()} className="px-4 py-2 rounded-lg bg-white/10 text-white/60 text-sm hover:bg-white/15 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1 min-w-0">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search agents by name or capability..."
            filters={allCapabilities}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        </div>
        {isAuthenticated && (
          <button
            onClick={() => setShowRegister(true)}
            className="flex min-h-11 w-full flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90 sm:w-auto"
          >
            <Plus size={16} />
            Register Agent
          </button>
        )}
      </div>

      {showRegister && <AgentRegisterModal onClose={() => setShowRegister(false)} />}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-white/40 text-sm font-[family-name:var(--font-body)]">
            No agents match your search criteria.
          </p>
        </div>
      )}
    </div>
  );
}
