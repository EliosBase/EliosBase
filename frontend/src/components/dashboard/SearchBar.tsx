'use client';

import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  filters?: string[];
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
}

export default function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  filters,
  activeFilter,
  onFilterChange,
}: SearchBarProps) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/8 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/30 transition-colors font-[family-name:var(--font-body)] focus:bg-white/8 focus:border-white/20 focus:outline-none"
        />
      </div>
      {filters && onFilterChange && (
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => onFilterChange(filter === activeFilter ? '' : filter)}
              className={`min-h-10 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                filter === activeFilter
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'bg-white/5 text-white/50 border border-white/8 hover:bg-white/10 hover:text-white/70'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
