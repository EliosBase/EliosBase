import ProofBadge from './ProofBadge';
import { type Task } from '@/lib/types';
import { TASK_STEPS } from '@/lib/constants';
import { Bot } from 'lucide-react';

interface TaskCardProps {
  task: Task;
}

export default function TaskCard({ task }: TaskCardProps) {
  const currentStepIndex = TASK_STEPS.indexOf(task.currentStep);

  const proofStatus = task.status === 'completed'
    ? 'verified' as const
    : task.currentStep === 'ZK Verifying'
      ? 'verifying' as const
      : 'pending' as const;

  return (
    <div className="glass p-5 rounded-2xl">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)]">
            {task.title}
          </h3>
          <p className="text-xs text-white/40 mt-0.5 font-[family-name:var(--font-body)]">
            {task.description}
          </p>
        </div>
        <ProofBadge status={proofStatus} proofId={task.zkProofId} />
      </div>

      {/* Timeline */}
      <div className="flex items-center gap-0 my-4">
        {TASK_STEPS.map((step, i) => {
          const done = i <= currentStepIndex;
          const isCurrent = i === currentStepIndex;
          return (
            <div key={step} className="flex-1 flex items-center">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-3 h-3 rounded-full border-2 transition-all ${
                    done
                      ? isCurrent
                        ? 'bg-white border-white shadow-[0_0_8px_rgba(255,255,255,0.3)]'
                        : 'bg-white/40 border-white/40'
                      : 'bg-transparent border-white/15'
                  }`}
                />
                <p className={`text-[9px] mt-1.5 text-center leading-tight ${
                  done ? 'text-white/60' : 'text-white/20'
                }`}>
                  {step}
                </p>
              </div>
              {i < TASK_STEPS.length - 1 && (
                <div className={`h-px flex-1 -mt-4 ${
                  i < currentStepIndex ? 'bg-white/30' : 'bg-white/8'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-white/6">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-white/40" />
          <span className="text-xs text-white/50 font-[family-name:var(--font-body)]">
            {task.assignedAgent}
          </span>
        </div>
        <span className="text-sm font-medium text-white font-[family-name:var(--font-mono)]">
          {task.reward}
        </span>
      </div>
    </div>
  );
}
