import { z } from 'zod';

export const createAlertSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  source: z.string().min(1, 'Source is required').max(200),
});

export type CreateAlertInput = z.infer<typeof createAlertSchema>;
