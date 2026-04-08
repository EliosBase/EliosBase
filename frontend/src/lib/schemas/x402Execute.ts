import { z } from 'zod';

export const x402ExecuteSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120, 'Title must be 120 characters or less'),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(4_000, 'Description must be 4000 characters or less'),
});

export type X402ExecuteInput = z.infer<typeof x402ExecuteSchema>;
