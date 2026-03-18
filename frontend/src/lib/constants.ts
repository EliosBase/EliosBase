import type { StatItem, TaskStep } from './types';

export const TASK_STEPS: TaskStep[] = [
  'Submitted', 'Decomposed', 'Assigned', 'Executing', 'ZK Verifying', 'Complete'
];

export const dashboardStats: StatItem[] = [
  { label: 'Active Agents', value: '2,847', trend: '+12.3%', trendUp: true },
  { label: 'Tasks in Progress', value: '1,204', trend: '+8.7%', trendUp: true },
  { label: 'Total Value Locked', value: '$14.2M', trend: '+23.1%', trendUp: true },
  { label: 'ZK Proofs Today', value: '8,491', trend: '+5.4%', trendUp: true },
];

export const sparklineData = {
  agents: [22, 25, 24, 28, 27, 30, 29, 32, 31, 34, 33, 36],
  tasks: [80, 95, 88, 102, 97, 110, 105, 118, 112, 120, 115, 120],
  tvl: [10, 10.5, 11, 11.2, 11.8, 12.1, 12.5, 13, 13.2, 13.8, 14, 14.2],
  proofs: [500, 520, 480, 550, 600, 580, 620, 650, 700, 750, 800, 849],
};
