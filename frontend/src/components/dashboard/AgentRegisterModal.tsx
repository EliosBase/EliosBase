'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useRegisterAgent } from '@/hooks/useRegisterAgent';

const AGENT_TYPES = ['sentinel', 'analyst', 'executor', 'auditor', 'optimizer'] as const;

interface AgentRegisterModalProps {
  onClose: () => void;
}

export default function AgentRegisterModal({ onClose }: AgentRegisterModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>('executor');
  const [capInput, setCapInput] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [price, setPrice] = useState('');
  const registerAgent = useRegisterAgent();

  const addCapability = (value: string) => {
    const cap = value.trim();
    if (cap && !capabilities.includes(cap) && capabilities.length < 10) {
      setCapabilities([...capabilities, cap]);
    }
    setCapInput('');
  };

  const handleCapKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCapability(capInput);
    }
  };

  const removeCap = (cap: string) => {
    setCapabilities(capabilities.filter((c) => c !== cap));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerAgent.mutate(
      {
        name,
        description,
        type,
        capabilities,
        pricePerTask: `${price} ETH`,
      },
      { onSuccess: () => { setTimeout(onClose, 1500); } }
    );
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-20 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative max-h-[85vh] overflow-y-auto rounded-2xl p-5 glass sm:p-8">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            aria-label="Close agent registration"
          >
            <X size={20} />
          </button>

          <h2 className="mb-1 pr-10 text-xl font-bold font-[family-name:var(--font-heading)] text-white">
            Register Agent
          </h2>
          <p className="text-sm text-white/40 mb-6 font-[family-name:var(--font-body)]">
            Register a new AI agent to the marketplace.
          </p>

          {registerAgent.isSuccess ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
                <span className="text-green-400 text-xl">✓</span>
              </div>
              <p className="text-white font-medium">Agent Registered</p>
              <p className="text-sm text-white/40 mt-1">Your agent is now listed on the marketplace.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-[family-name:var(--font-body)]">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="e.g., Sentinel Alpha"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/8 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-[family-name:var(--font-body)]">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={3}
                  maxLength={500}
                  placeholder="Describe your agent's purpose and capabilities..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/8 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-[family-name:var(--font-body)]">
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/8 text-sm text-white focus:outline-none focus:border-white/20 transition-colors appearance-none"
                >
                  {AGENT_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-neutral-900">
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-[family-name:var(--font-body)]">
                  Capabilities (press Enter to add, max 10)
                </label>
                <input
                  type="text"
                  value={capInput}
                  onChange={(e) => setCapInput(e.target.value)}
                  onKeyDown={handleCapKeyDown}
                  placeholder="e.g., smart-contract-audit"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/8 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
                />
                {capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {capabilities.map((cap) => (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => removeCap(cap)}
                        className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-white/50 border border-white/6 hover:border-red-500/30 hover:text-red-400 transition-colors"
                      >
                        {cap} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-[family-name:var(--font-body)]">
                  Price per Task (ETH)
                </label>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  placeholder="0.01"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/8 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors font-[family-name:var(--font-mono)]"
                />
              </div>

              {registerAgent.isError && (
                <p className="text-xs text-red-400">
                  {registerAgent.error.message}
                </p>
              )}

              <button
                type="submit"
                disabled={registerAgent.isPending || capabilities.length === 0}
                className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 transition-colors mt-2 disabled:opacity-50"
              >
                {registerAgent.isPending ? 'Registering...' : 'Register Agent'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
