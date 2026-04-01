import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z
    .string({ error: 'Title is required' })
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or fewer'),
  description: z
    .string({ error: 'Description is required' })
    .min(1, 'Description is required')
    .max(2000, 'Description must be 2000 characters or fewer'),
  reward: z
    .string({ error: 'Reward is required' })
    .min(1, 'Reward is required'),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  current_step: z
    .enum(['Submitted', 'Decomposed', 'Assigned', 'Executing', 'ZK Verifying', 'Complete'])
    .optional(),
  status: z.enum(['active', 'completed', 'failed', 'cancelled']).optional(),
  assigned_agent: z.string().optional(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskDisputeSchema = z.object({
  reason: z
    .string({ error: 'Dispute reason is required' })
    .min(10, 'Reason must be at least 10 characters')
    .max(1000, 'Reason must be 1000 characters or fewer'),
  evidence: z.string().max(2000).optional(),
});

export type TaskDisputeInput = z.infer<typeof taskDisputeSchema>;
