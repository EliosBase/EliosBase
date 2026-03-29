import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  useAuthContext: vi.fn(),
  useEscrowLock: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock('@/hooks/useEscrow', () => ({
  useEscrowLock: mocks.useEscrowLock,
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuthContext: mocks.useAuthContext,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mocks.useQueryClient,
}));

const { default: AgentCard } = await import('@/components/dashboard/AgentCard');

describe('AgentCard', () => {
  it('shows a busy state instead of inviting another hire', () => {
    mocks.useAuthContext.mockReturnValue({
      isAuthenticated: true,
      session: { userId: 'user-2' },
    });
    mocks.useQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mocks.useEscrowLock.mockReturnValue({
      lock: vi.fn(),
      txHash: undefined,
      isSigning: false,
      isMining: false,
      isConfirmed: false,
      error: null,
      reset: vi.fn(),
    });

    const html = renderToStaticMarkup(
      createElement(AgentCard, {
        agent: {
          id: 'agent-1',
          name: 'Wallet Agent',
          description: 'Executes wallet tasks',
          capabilities: ['wallet-flow'],
          reputation: 91,
          tasksCompleted: 12,
          pricePerTask: '0.000001 ETH',
          status: 'busy',
          type: 'executor',
          ownerId: 'user-1',
        },
      }),
    );

    expect(html).toContain('Busy');
    expect(html).not.toContain('>Hire<');
  });
});
