'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface TaskSubmitModalProps {
  onClose: () => void;
}

export default function TaskSubmitModal({ onClose }: TaskSubmitModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glass p-8 rounded-2xl relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>

          <h2 className="text-xl font-bold font-[family-name:var(--font-heading)] text-white mb-1">
            Submit New Task
          </h2>
          <p className="text-sm text-white/40 mb-6 font-[family-name:var(--font-body)]">
            Define your task and set a reward for the executing agent.
          </p>

          {submitted ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
                <span className="text-green-400 text-xl">✓</span>
              </div>
              <p className="text-white font-medium">Task Submitted</p>
              <p className="text-sm text-white/40 mt-1">Entering decomposition phase...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-[family-name:var(--font-body)]">
                  Task Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g., Smart contract security audit"
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
                  placeholder="Describe what the agent should accomplish..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/8 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-[family-name:var(--font-body)]">
                  Reward (ETH)
                </label>
                <input
                  type="text"
                  value={reward}
                  onChange={(e) => setReward(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/8 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors font-[family-name:var(--font-mono)]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 transition-colors mt-2"
              >
                Submit Task
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
