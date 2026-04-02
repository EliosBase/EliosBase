'use client';

import { useState } from 'react';
import TaskCard from '@/components/dashboard/TaskCard';
import TaskSubmitModal from '@/components/dashboard/TaskSubmitModal';
import { useTasks } from '@/hooks/useTasks';
import { useBatchTaskAdvancement } from '@/hooks/useTaskAdvancement';
import { useAuthContext } from '@/providers/AuthProvider';
import { Plus } from 'lucide-react';

export default function TasksPage() {
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<'active' | 'failed' | 'completed'>('active');
  const { data: tasks = [], isLoading, isError, refetch } = useTasks();
  const { session } = useAuthContext();
  useBatchTaskAdvancement();

  const activeTasks = tasks.filter((t) => t.status === 'active');
  const failedTasks = tasks.filter((t) => t.status === 'failed');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const displayedTasks = tab === 'active'
    ? activeTasks
    : tab === 'failed'
      ? failedTasks
      : completedTasks;

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
        <p className="text-white/40 text-sm font-[family-name:var(--font-body)]">Failed to load tasks.</p>
        <button onClick={() => refetch()} className="px-4 py-2 rounded-lg bg-white/10 text-white/60 text-sm hover:bg-white/15 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl bg-white/5 p-1">
          <button
            onClick={() => setTab('active')}
            className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              tab === 'active'
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Active ({activeTasks.length})
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              tab === 'completed'
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Completed ({completedTasks.length})
          </button>
          <button
            onClick={() => setTab('failed')}
            className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              tab === 'failed'
                ? 'bg-red-500/15 text-red-200'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Failed ({failedTasks.length})
          </button>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90 sm:w-auto"
        >
          <Plus size={16} />
          Submit New Task
        </button>
      </div>

      {/* Task List */}
      <div className="space-y-4">
        {displayedTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            isSubmitter={session?.userId === task.submitterId}
            canViewResult={session?.userId === task.submitterId || session?.role === 'admin'}
          />
        ))}
      </div>

      {displayedTasks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-white/40 text-sm font-[family-name:var(--font-body)]">
            No {tab} tasks.
          </p>
        </div>
      )}

      {showModal && <TaskSubmitModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
