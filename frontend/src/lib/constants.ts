import type { TaskStep } from './types';

export const TASK_STEPS: TaskStep[] = [
  'Submitted', 'Decomposed', 'Assigned', 'Executing', 'ZK Verifying', 'Complete'
];

export const sparklineData = {
  agents: [22, 25, 24, 28, 27, 30, 29, 32, 31, 34, 33, 36],
  tasks: [80, 95, 88, 102, 97, 110, 105, 118, 112, 120, 115, 120],
  tvl: [10, 10.5, 11, 11.2, 11.8, 12.1, 12.5, 13, 13.2, 13.8, 14, 14.2],
  proofs: [500, 520, 480, 550, 600, 580, 620, 650, 700, 750, 800, 849],
};
