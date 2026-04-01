import { z } from 'zod';

export const siweVerifySchema = z.object({
  message: z
    .string({ error: 'SIWE message is required' })
    .min(1, 'SIWE message is required'),
  signature: z
    .string({ error: 'Signature is required' })
    .regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature format'),
});

export type SiweVerifyInput = z.infer<typeof siweVerifySchema>;
