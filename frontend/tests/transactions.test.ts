import { describe, expect, it } from 'vitest';
import { normalizeTransactionType } from '@/lib/transactions';

describe('normalizeTransactionType', () => {
  it('maps legacy self-directed escrow releases to escrow_refund', () => {
    expect(normalizeTransactionType({
      type: 'escrow_release',
      from: '0xabc',
      to: '0xAbC',
    })).toBe('escrow_refund');
  });

  it('maps vault-to-wallet legacy aliases to escrow_refund', () => {
    expect(normalizeTransactionType({
      type: 'escrow_release',
      from: 'Escrow Vault',
      to: '0xabc0000000000000000000000000000000000000',
    })).toBe('escrow_refund');
  });

  it('keeps normal escrow releases intact', () => {
    expect(normalizeTransactionType({
      type: 'escrow_release',
      from: 'Escrow Vault',
      to: 'Wallet Agent',
    })).toBe('escrow_release');
  });
});
