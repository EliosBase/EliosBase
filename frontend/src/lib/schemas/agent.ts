import { z } from 'zod';

const VALID_TYPES = ['sentinel', 'analyst', 'executor', 'auditor', 'optimizer'] as const;

export const registerAgentSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer'),
  description: z
    .string({ error: 'Description is required' })
    .min(1, 'Description is required')
    .max(500, 'Description must be 500 characters or fewer'),
  type: z.enum(VALID_TYPES).default('executor'),
  capabilities: z
    .array(z.string().max(50))
    .max(10, 'Maximum 10 capabilities')
    .default([]),
  pricePerTask: z.string().default('0.01 ETH'),
});

export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;

export const hireAgentSchema = z.object({
  taskId: z.string({ error: 'Task ID is required' }),
  txHash: z
    .string({ error: 'Transaction hash is required' })
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash'),
});

export type HireAgentInput = z.infer<typeof hireAgentSchema>;
