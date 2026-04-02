import { z } from 'zod';

const ethAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');
const txHash = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash');

export const syncTransactionSchema = z.object({
  type: z.enum(['escrow_lock', 'escrow_release', 'escrow_refund', 'payment', 'reward', 'stake']),
  from: ethAddress,
  to: ethAddress,
  amount: z.string().min(1, 'Amount is required'),
  token: z.string().min(1, 'Token is required'),
  txHash,
});

export type SyncTransactionInput = z.infer<typeof syncTransactionSchema>;
