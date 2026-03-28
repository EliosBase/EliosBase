'use client';

import { useMemo } from 'react';
import { X, FileText } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';

interface TaskPickerModalProps {
  onSelect: (taskId: string) => void;
  onClose: () => void;
}

const ASSIGNABLE_STEPS = ['Submitted', 'Decomposed'];

export default function TaskPickerModal({ onSelect, onClose }: TaskPickerModalProps) {
  const { data: tasks = [], isLoading } = useTasks();

  const eligibleTasks = useMemo(
    () => tasks.filter((t) => t.status === 'active' && ASSIGNABLE_STEPS.includes(t.currentStep) && !t.assignedAgent),
    [tasks]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glass p-6 rounded-2xl relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            aria-label="Close task picker"
          >
            <X size={20} />
          </button>

          <h2 className="text-lg font-bold font-[family-name:var(--font-heading)] text-white mb-1">
            Select Task
          </h2>
          <p className="text-sm text-white/40 mb-4 font-[family-name:var(--font-body)]">
            Choose which task to assign this agent to.
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
          ) : eligibleTasks.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-white/40 text-sm font-[family-name:var(--font-body)]">
                No unassigned tasks available.
              </p>
              <p className="text-white/30 text-xs mt-1">Create a task first from the Tasks page.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {eligibleTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => onSelect(task.id)}
                  className="w-full text-left p-3 rounded-xl bg-white/5 border border-white/6 hover:border-white/15 hover:bg-white/8 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText size={14} className="text-white/50" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{task.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-white/40 px-1.5 py-0.5 rounded bg-white/5">
                          {task.currentStep}
                        </span>
                        <span className="text-[10px] text-white/50 font-[family-name:var(--font-mono)]">
                          {task.reward}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
