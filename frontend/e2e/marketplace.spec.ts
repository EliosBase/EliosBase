import { expect, test } from '@playwright/test';
import { mockAppApi } from './support/mockApi';

const session = {
  authenticated: true,
  userId: 'operator-7',
  walletAddress: '0xbeef00000000000000000000000000000000cafe',
  chainId: 8453,
  role: 'operator' as const,
};

const agents = [
  {
    id: 'agent-a',
    name: 'Audit Sentinel',
    description: 'Focuses on Solidity review and access-control analysis.',
    capabilities: ['solidity-audit', 'access-control'],
    reputation: 98,
    tasksCompleted: 214,
    pricePerTask: '0.12 ETH',
    status: 'online',
    type: 'auditor',
    ownerId: 'owner-a',
  },
  {
    id: 'agent-b',
    name: 'Fast Executor',
    description: 'Runs operational scripts and delivery checklists.',
    capabilities: ['ops', 'release'],
    reputation: 91,
    tasksCompleted: 144,
    pricePerTask: '0.08 ETH',
    status: 'online',
    type: 'executor',
    ownerId: 'owner-b',
  },
];

test('filters marketplace results and registers a new agent', async ({ page }) => {
  let registeredAgent: Record<string, unknown> | null = null;

  await mockAppApi(page, {
    session,
    agents,
    onAgentRegister: (body) => {
      registeredAgent = body;
    },
  });

  await page.goto('/app/marketplace');

  await expect(page.getByRole('heading', { name: 'Agent Marketplace' })).toBeVisible();
  await page.getByPlaceholder('Search agents by name or capability...').fill('Audit');
  await expect(page.getByText('Audit Sentinel')).toBeVisible();
  await expect(page.getByText('Fast Executor')).toHaveCount(0);

  await page.getByRole('button', { name: 'Register Agent' }).click();
  await page.getByPlaceholder('e.g., Sentinel Alpha').fill('Route Watcher');
  await page.getByPlaceholder("Describe your agent's purpose and capabilities...").fill('Monitors task execution failures and reports remediation steps.');
  await page.locator('select').selectOption('sentinel');
  await page.getByPlaceholder('e.g., smart-contract-audit').fill('incident-response');
  await page.getByPlaceholder('e.g., smart-contract-audit').press('Enter');
  await page.getByPlaceholder('0.01').fill('0.09');
  await page.locator('form').getByRole('button', { name: 'Register Agent' }).click();

  await expect(page.getByText('Agent Registered')).toBeVisible();
  await expect
    .poll(() => registeredAgent)
    .toEqual({
      name: 'Route Watcher',
      description: 'Monitors task execution failures and reports remediation steps.',
      type: 'sentinel',
      capabilities: ['incident-response'],
      pricePerTask: '0.09 ETH',
    });
});

test('hires an agent through the task picker and records the escrow lock in wallet history', async ({ page }) => {
  await mockAppApi(page, {
    session,
    e2eWalletConnected: true,
    agents: [
      {
        id: 'agent-a',
        name: 'Audit Sentinel',
        description: 'Focuses on Solidity review and access-control analysis.',
        capabilities: ['solidity-audit', 'access-control'],
        reputation: 98,
        tasksCompleted: 214,
        pricePerTask: '0.12 ETH',
        status: 'online',
        type: 'auditor',
        ownerId: 'owner-a',
      },
    ],
    tasks: [
      {
        id: 'task-open',
        title: 'Payment flow audit',
        description: 'Verify release invariants.',
        status: 'active',
        currentStep: 'Submitted',
        assignedAgent: '',
        reward: '0.12 ETH',
        submittedAt: '2026-03-24T12:00:00.000Z',
        submitterId: 'operator-7',
      },
    ],
    transactions: [],
  });

  await page.goto('/app/marketplace');

  await page.getByRole('button', { name: 'Hire' }).click();
  await expect(page.getByRole('heading', { name: 'Select Task' })).toBeVisible();
  await page.getByRole('button', { name: /Payment flow audit/ }).click();

  await expect(page.getByRole('button', { name: 'Hired' })).toBeVisible();

  await page.goto('/app/wallet');
  await expect(page.getByText('Escrow Lock')).toBeVisible();
  await expect(page.getByText('0.12 ETH', { exact: true }).last()).toBeVisible();
});
