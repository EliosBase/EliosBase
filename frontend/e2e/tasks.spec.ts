import { expect, test } from '@playwright/test';
import { mockAppApi } from './support/mockApi';

const session = {
  authenticated: true,
  userId: 'user-1',
  walletAddress: '0x123400000000000000000000000000000000abcd',
  chainId: 8453,
  role: 'submitter' as const,
};

const tasks = [
  {
    id: 'task-active',
    title: 'Broken execution task',
    description: 'Re-run the failed agent configuration.',
    status: 'active',
    currentStep: 'Assigned',
    assignedAgent: 'Sentinel Prime',
    reward: '0.15 ETH',
    submittedAt: '2026-03-24T10:00:00.000Z',
    submitterId: 'user-1',
    executionFailureMessage: 'Anthropic credentials are missing for this agent.',
    executionFailureRetryable: false,
  },
  {
    id: 'task-complete',
    title: 'Contract audit report',
    description: 'Summarize the critical Solidity findings.',
    status: 'completed',
    currentStep: 'Complete',
    assignedAgent: 'Audit Matrix',
    reward: '0.25 ETH',
    submittedAt: '2026-03-24T08:00:00.000Z',
    completedAt: '2026-03-24T09:00:00.000Z',
    submitterId: 'user-1',
    hasExecutionResult: true,
    zkProofId: 'proof-42',
  },
  {
    id: 'task-failed',
    title: 'Stalled execution task',
    description: 'Track the terminal execution failure path.',
    status: 'failed',
    currentStep: 'Assigned',
    assignedAgent: 'Audit Matrix',
    reward: '0.20 ETH',
    submittedAt: '2026-03-24T07:30:00.000Z',
    submitterId: 'user-1',
    executionFailureMessage: 'Anthropic request failed temporarily. Retry budget exhausted after 3 attempts.',
    executionFailureRetryable: false,
  },
];

const taskResult = {
  summary: 'The executor found two authorization gaps and one low-risk event issue.',
  findings: [
    {
      severity: 'critical',
      title: 'Critical auth bypass',
      description: 'Missing role checks let an untrusted caller release escrowed funds.',
    },
    {
      severity: 'low',
      title: 'Sparse event coverage',
      description: 'Escrow cancellation does not emit enough detail for operators.',
    },
  ],
  recommendations: [
    'Add explicit owner checks before releasing locked funds.',
    'Emit richer cancellation events for downstream monitoring.',
  ],
  metadata: {
    model: 'claude-sonnet-4-20250514',
    tokensUsed: 4120,
    executionTimeMs: 3812,
    agentType: 'auditor',
    capabilities: ['solidity-audit', 'threat-modeling'],
  },
};

test('shows execution failures and opens a stored task result', async ({ page }) => {
  await mockAppApi(page, {
    session,
    tasks,
    taskResult,
  });

  await page.goto('/app/tasks');

  await expect(page.getByRole('heading', { name: 'Task Management' })).toBeVisible();
  await expect(page.getByText('Execution Blocked')).toBeVisible();
  await expect(page.getByText('Anthropic credentials are missing for this agent.')).toBeVisible();

  await page.getByRole('button', { name: 'Failed (1)' }).click();
  await expect(page.getByText('Stalled execution task')).toBeVisible();
  await expect(page.getByText('Execution Failed')).toBeVisible();
  await expect(page.getByText('Automatic retries have stopped for this task and an operator alert has been raised for manual intervention.')).toBeVisible();

  await page.getByRole('button', { name: 'Completed (1)' }).click();
  await expect(page.getByText('Contract audit report')).toBeVisible();

  await page.getByRole('button', { name: 'View Result' }).click();
  await expect(page.getByText('Task Result')).toBeVisible();
  await expect(page.getByText('Critical auth bypass')).toBeVisible();
  await expect(page.getByText('Emit richer cancellation events for downstream monitoring.')).toBeVisible();
  await expect(page.getByText('claude-sonnet-4-20250514')).toBeVisible();
});

test('submits a task from the dashboard modal', async ({ page }) => {
  let createdTask: Record<string, unknown> | null = null;

  await mockAppApi(page, {
    session,
    tasks: [],
    onTaskCreate: (body) => {
      createdTask = body;
    },
  });

  await page.goto('/app/tasks');
  await page.getByRole('button', { name: 'Submit New Task' }).click();

  await page.getByPlaceholder('e.g., Smart contract security audit').fill('Base security review');
  await page.getByPlaceholder('Describe what the agent should accomplish...').fill('Audit the execution pipeline and summarize broken auth checks.');
  await page.getByPlaceholder('0.00').fill('0.05');
  await page.getByRole('button', { name: 'Submit Task' }).click();

  await expect(page.getByText('Task Submitted')).toBeVisible();
  await expect
    .poll(() => createdTask)
    .toEqual({
      title: 'Base security review',
      description: 'Audit the execution pipeline and summarize broken auth checks.',
      reward: '0.05 ETH',
    });
});

test('releases escrow for a completed verified task and records the payout', async ({ page }) => {
  await mockAppApi(page, {
    session,
    e2eWalletConnected: true,
    verifiedTasks: ['task-complete'],
    tasks: [
      {
        id: 'task-complete',
        title: 'Contract audit report',
        description: 'Summarize the critical Solidity findings.',
        status: 'completed',
        currentStep: 'Complete',
        assignedAgent: 'Audit Matrix',
        reward: '0.25 ETH',
        submittedAt: '2026-03-24T08:00:00.000Z',
        completedAt: '2026-03-24T09:00:00.000Z',
        submitterId: 'user-1',
        hasExecutionResult: true,
        zkProofId: 'proof-42',
        agentOperatorAddress: '0xfeed00000000000000000000000000000000beef',
      },
    ],
    transactions: [],
  });

  await page.goto('/app/tasks');
  await page.getByRole('button', { name: 'Completed (1)' }).click();
  await expect(page.getByRole('button', { name: 'Release Funds' })).toBeVisible();

  await page.getByRole('button', { name: 'Release Funds' }).click();
  await expect(page.getByRole('button', { name: /Released/ })).toBeVisible();

  await page.goto('/app/wallet');
  await expect(page.getByText('Escrow Release')).toBeVisible();
  await expect(page.getByText('0.25 ETH')).toBeVisible();
});
