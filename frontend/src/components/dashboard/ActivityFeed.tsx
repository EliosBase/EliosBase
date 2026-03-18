import { type ActivityEvent } from '@/lib/types';
import { Zap, CreditCard, ListChecks, ShieldCheck, Bot } from 'lucide-react';

const iconMap = {
  proof: Zap,
  payment: CreditCard,
  task: ListChecks,
  security: ShieldCheck,
  agent: Bot,
};

interface ActivityFeedProps {
  events: ActivityEvent[];
}

export default function ActivityFeed({ events }: ActivityFeedProps) {
  return (
    <div className="space-y-1">
      {events.map((event) => {
        const Icon = iconMap[event.type];
        return (
          <div key={event.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/3 transition-colors">
            <div className="mt-0.5 w-6 h-6 rounded-md bg-white/5 flex items-center justify-center flex-shrink-0">
              <Icon size={13} className="text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/70 font-[family-name:var(--font-body)] leading-snug">
                {event.message}
              </p>
              <p className="text-[11px] text-white/30 mt-0.5">{event.timestamp}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
