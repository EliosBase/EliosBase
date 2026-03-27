import { expect, test } from '@playwright/test';
import { mockAppApi } from './support/mockApi';

const session = {
  authenticated: true,
  userId: 'user-1',
  walletAddress: '0x123400000000000000000000000000000000abcd',
  chainId: 84532,
  role: 'submitter' as const,
};

test('renders dashboard data, connects the e2e wallet, and signs out cleanly', async ({ page }) => {
  await mockAppApi(page, {
    session,
    stats: {
      activeAgents: 12,
      activeAgentsTrend: '+2',
      activeTasks: 4,
      activeTasksTrend: '+1',
      tvl: 6.5,
      tvlTrend: '+0.4 ETH',
      zkProofs: 88,
      zkProofsTrend: '+6%',
    },
    tasks: [
      {
        id: 'task-1',
        title: 'Audit release path',
        description: 'Confirm escrow release is guarded.',
        status: 'active',
        currentStep: 'Assigned',
        assignedAgent: 'Audit Sentinel',
        reward: '0.15 ETH',
        submittedAt: '2026-03-24T10:00:00.000Z',
      },
    ],
    agents: [
      {
        id: 'agent-1',
        name: 'Audit Sentinel',
        description: 'Reviews contract release flows.',
        capabilities: ['audit'],
        reputation: 97,
        tasksCompleted: 120,
        pricePerTask: '0.15 ETH',
        status: 'online',
        type: 'auditor',
      },
    ],
    activity: [
      { id: 'ev-1', type: 'task', message: 'Task assigned to Audit Sentinel', timestamp: '2 min ago' },
      { id: 'ev-2', type: 'proof', message: 'Proof verified for payment pipeline audit', timestamp: '5 min ago' },
    ],
  });

  await page.goto('/app');

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Active Agents')).toBeVisible();
  await expect(page.getByText('Audit release path')).toBeVisible();
  await expect(page.getByText('Task assigned to Audit Sentinel')).toBeVisible();

  await page.getByRole('button', { name: 'Connect Wallet' }).click();
  await expect(page.getByText('0x1234...abcd').first()).toBeVisible();

  await page.getByRole('button', { name: 'Disconnect wallet' }).click();
  await expect(page.getByRole('button', { name: 'Connect Wallet' })).toBeVisible();
});

test('supports mobile sidebar navigation between app sections', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAppApi(page, {
    session,
    transactions: [
      {
        id: 'tx-1',
        type: 'escrow_lock',
        from: '0x1234',
        to: 'agent-1',
        amount: '0.10 ETH',
        token: 'ETH',
        status: 'confirmed',
        timestamp: '2026-03-24T11:00:00.000Z',
        txHash: '0xlock',
      },
    ],
  });

  await page.goto('/app');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Wallet' })).toBeVisible();

  await page.getByRole('link', { name: 'Wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Wallet & Payments' })).toBeVisible();
  await expect(page.getByText('Transaction History')).toBeVisible();
  await expect(page.getByText('Escrow Lock')).toBeVisible();
});
