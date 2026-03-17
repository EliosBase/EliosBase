'use client';

import { useState, useMemo } from 'react';
import SearchBar from '@/components/dashboard/SearchBar';
import AgentCard from '@/components/dashboard/AgentCard';
import { agents } from '@/lib/mock-data';

const allCapabilities = Array.from(new Set(agents.flatMap((a) => a.capabilities))).sort();

export default function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

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
  }, [search, activeFilter]);

  return (
    <div className="space-y-6 max-w-7xl">
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search agents by name or capability..."
        filters={allCapabilities}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

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
