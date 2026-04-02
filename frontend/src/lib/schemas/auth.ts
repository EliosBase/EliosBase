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

export const farcasterVerifySchema = z.object({
  message: z.string().min(1, 'Message is required'),
  signature: z.string().min(1, 'Signature is required'),
  fid: z.number().int().positive('FID must be a positive integer'),
  username: z.string().max(50).optional(),
  pfpUrl: z.string().url().max(500).optional(),
});

export type FarcasterVerifyInput = z.infer<typeof farcasterVerifySchema>;

export const farcasterLinkSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  signature: z.string().min(1, 'Signature is required'),
  fid: z.number().int().positive('FID must be a positive integer'),
  username: z.string().max(50).optional(),
  pfpUrl: z.string().url().max(500).optional(),
});

export type FarcasterLinkInput = z.infer<typeof farcasterLinkSchema>;

export const txHashSchema = z.object({
  txHash: z
    .string({ error: 'Transaction hash is required' })
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash'),
});

export type TxHashInput = z.infer<typeof txHashSchema>;
