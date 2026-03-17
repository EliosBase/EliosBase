import MiniChart from './MiniChart';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
  chartData?: number[];
}

export default function StatCard({ label, value, trend, trendUp, chartData }: StatCardProps) {
  return (
    <div className="glass p-5 rounded-2xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-white/50 font-[family-name:var(--font-body)] uppercase tracking-wider mb-1">
            {label}
          </p>
          <p className="text-2xl font-bold font-[family-name:var(--font-heading)] text-white">
            {value}
          </p>
          <div className="flex items-center gap-1 mt-1.5">
            {trendUp ? (
              <TrendingUp size={12} className="text-green-400" />
            ) : (
              <TrendingDown size={12} className="text-red-400" />
            )}
            <span className={`text-xs font-medium ${trendUp ? 'text-green-400' : 'text-red-400'}`}>
              {trend}
            </span>
          </div>
        </div>
        {chartData && (
          <div className="w-20 h-10">
            <MiniChart data={chartData} />
          </div>
        )}
      </div>
    </div>
  );
}
