import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  useEscrowRefund: vi.fn(),
  useEscrowRelease: vi.fn(),
  useEscrowStatus: vi.fn(),
  useProofVerification: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock('@/hooks/useEscrow', () => ({
  useEscrowRelease: mocks.useEscrowRelease,
  useEscrowRefund: mocks.useEscrowRefund,
  useEscrowStatus: mocks.useEscrowStatus,
}));

vi.mock('@/hooks/useProofVerification', () => ({
  useProofVerification: mocks.useProofVerification,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mocks.useQueryClient,
}));

vi.mock('@/components/dashboard/ProofBadge', () => ({
  default: () => null,
}));

vi.mock('@/components/dashboard/TaskResultModal', () => ({
  default: () => null,
}));

const { default: TaskCard } = await import('@/components/dashboard/TaskCard');

describe('TaskCard', () => {
  it('shows refunded escrow as a terminal state', () => {
    mocks.useQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mocks.useProofVerification.mockReturnValue({ isVerified: false });
    mocks.useEscrowStatus.mockReturnValue({
      amount: 0n,
      depositor: '0x0000000000000000000000000000000000000000',
      isLoading: false,
      state: 'Refunded',
    });
    mocks.useEscrowRelease.mockReturnValue({
      release: vi.fn(),
      txHash: undefined,
      isSigning: false,
      isMining: false,
      isConfirmed: false,
      error: null,
      reset: vi.fn(),
    });
    mocks.useEscrowRefund.mockReturnValue({
      refundFunds: vi.fn(),
      txHash: undefined,
      isSigning: false,
      isMining: false,
      isConfirmed: false,
      error: null,
      reset: vi.fn(),
    });

    const html = renderToStaticMarkup(
      createElement(TaskCard, {
        task: {
          id: 'task-1',
          title: 'Wallet flow task',
          description: 'Validate refund handling',
          status: 'failed',
          currentStep: 'Assigned',
          assignedAgent: 'Wallet Agent',
          reward: '0.000001 ETH',
          submittedAt: new Date().toISOString(),
          hasExecutionResult: false,
          hasOpenDispute: false,
        },
        isSubmitter: true,
      }),
    );

    expect(html).toContain('Escrow Refunded');
    expect(html).not.toContain('Refund Escrow');
    expect(html).not.toContain('Open Dispute');
  });
});
