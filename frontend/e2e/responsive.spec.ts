import { expect, test, type Page } from '@playwright/test';
import { mockAppApi } from './support/mockApi';

const mobileViewport = { width: 390, height: 844 };

const adminSession = {
  authenticated: true,
  userId: 'admin-1',
  walletAddress: '0x123400000000000000000000000000000000abcd',
  chainId: 8453,
  role: 'admin' as const,
};

const agents = [
  {
    id: 'agent-1',
    name: 'Audit Matrix',
    description: 'Runs Solidity review, incident response, and escrow release analysis.',
    capabilities: ['solidity-audit', 'incident-response', 'release-review'],
    reputation: 98,
    tasksCompleted: 214,
    pricePerTask: '0.15 ETH',
    status: 'online',
    type: 'auditor',
    ownerId: 'admin-1',
    walletAddress: '0xsafe000000000000000000000000000000000001',
    walletKind: 'safe',
    walletStatus: 'active',
    walletStandard: 'safe7579',
    walletMigrationState: 'migrated',
    walletPolicy: {
      standard: 'safe7579',
      owner: '0x123400000000000000000000000000000000abcd',
      policySigner: '0xfeed00000000000000000000000000000000beef',
      owners: [
        '0x123400000000000000000000000000000000abcd',
        '0xfeed00000000000000000000000000000000beef',
      ],
      threshold: 2,
      dailySpendLimitEth: '0.50',
      reviewThresholdEth: '0.25',
      timelockThresholdEth: '1.00',
    },
    walletSession: {
      address: '0x9999000000000000000000000000000000000001',
    },
  },
  {
    id: 'agent-2',
    name: 'Route Watcher',
    description: 'Tracks execution failures and summarizes remediation steps.',
    capabilities: ['ops', 'alerting'],
    reputation: 92,
    tasksCompleted: 88,
    pricePerTask: '0.09 ETH',
    status: 'online',
    type: 'sentinel',
    ownerId: 'owner-2',
  },
];

const tasks = [
  {
    id: 'task-active',
    title: 'Execution pipeline review',
    description: 'Trace the failed operator auth path and identify the exact release blocker.',
    status: 'active',
    currentStep: 'Assigned',
    assignedAgent: 'Audit Matrix',
    reward: '0.15 ETH',
    submittedAt: '2026-03-24T10:00:00.000Z',
    submitterId: 'admin-1',
    executionFailureMessage: 'Policy signer rotation has not completed for this wallet.',
    executionFailureRetryable: false,
  },
  {
    id: 'task-complete',
    title: 'Contract audit report',
    description: 'Summarize critical release-path findings for the Base launch.',
    status: 'completed',
    currentStep: 'Complete',
    assignedAgent: 'Audit Matrix',
    reward: '0.25 ETH',
    submittedAt: '2026-03-24T08:00:00.000Z',
    completedAt: '2026-03-24T09:00:00.000Z',
    submitterId: 'admin-1',
    hasExecutionResult: true,
    zkProofId: 'proof-42',
    agentPayoutAddress: '0xsafe000000000000000000000000000000000042',
  },
  {
    id: 'task-open',
    title: 'Policy migration checklist',
    description: 'Prepare a release-ready checklist for the Safe7579 rollout.',
    status: 'active',
    currentStep: 'Submitted',
    assignedAgent: '',
    reward: '0.08 ETH',
    submittedAt: '2026-03-24T11:00:00.000Z',
    submitterId: 'admin-1',
  },
];

const taskResult = {
  summary: 'The executor identified two release-path gaps and one low-risk monitoring issue.',
  findings: [
    {
      severity: 'critical',
      title: 'Critical auth bypass',
      description: 'A missing signer check would let an untrusted caller release escrowed funds.',
    },
    {
      severity: 'medium',
      title: 'Sparse monitoring hooks',
      description: 'Guardrail resolution events do not provide enough context for operators.',
    },
  ],
  recommendations: [
    'Require the Safe owner signature before release execution.',
    'Emit richer guardrail resolution events.',
  ],
  metadata: {
    model: 'claude-sonnet-4-20250514',
    tokensUsed: 4120,
    executionTimeMs: 3812,
    agentType: 'auditor',
    capabilities: ['solidity-audit', 'threat-modeling'],
  },
};

async function expectNoViewportOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const docWidth = document.documentElement.scrollWidth;
    const offenders = Array.from(document.querySelectorAll('body *'))
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .filter((node) => {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return false;
        }

        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return false;
        }
        if (rect.right <= 0 || rect.left >= viewport) {
          return false;
        }

        return rect.left < -1 || rect.right > viewport + 1;
      })
      .slice(0, 10)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          tag: node.tagName,
          className: node.className,
          text: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      });

    return { viewport, docWidth, offenders };
  });

  expect(metrics.docWidth, JSON.stringify(metrics.offenders)).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.offenders, JSON.stringify(metrics.offenders)).toEqual([]);
}

test('keeps the public landing page within the mobile viewport', async ({ page }) => {
  await page.setViewportSize(mobileViewport);
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Toggle menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle menu' }).click();
  await expect(page.locator('#mobile-nav').getByRole('link', { name: 'Launch App' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore the Platform' })).toBeVisible();
  await expect(page.locator('#mobile-nav').getByRole('link', { name: 'How It Works' })).toBeVisible();

  await expectNoViewportOverflow(page);

   await page.locator('#mobile-nav').getByRole('link', { name: 'Launch App' }).click();
   await page.waitForURL('**/app');
   await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('keeps dashboard routes and modals usable on mobile', async ({ page }) => {
  await page.setViewportSize(mobileViewport);
  await mockAppApi(page, {
    session: adminSession,
    e2eWalletConnected: true,
    verifiedTasks: ['task-complete'],
    agents,
    tasks,
    taskResult,
    activity: [
      { id: 'ev-1', type: 'task', message: 'Execution pipeline review assigned to Audit Matrix', timestamp: '2 min ago' },
      { id: 'ev-2', type: 'proof', message: 'Proof verified for Contract audit report', timestamp: '5 min ago' },
    ],
    transactions: [
      {
        id: 'tx-1',
        type: 'escrow_lock',
        from: '0x1234',
        to: '0xagent',
        amount: '0.15 ETH',
        token: 'ETH',
        status: 'confirmed',
        timestamp: '2026-03-24T11:00:00.000Z',
        txHash: '0xlock',
      },
    ],
    walletStats: {
      balance: '3.21 ETH',
      balanceTrend: '+0.12 ETH',
      inEscrow: '0.45 ETH',
      inEscrowTrend: '+0.05 ETH',
      totalEarned: '8.80 ETH',
      totalEarnedTrend: '+0.20 ETH',
      staked: '1.50 ETH',
      stakedTrend: 'Stable',
    },
    agentWalletTransfers: [
      {
        id: 'awt-1',
        agentId: 'agent-1',
        agentName: 'Audit Matrix',
        safeAddress: '0xsafe000000000000000000000000000000000001',
        destination: '0xfeed00000000000000000000000000000000beef',
        amountEth: '0.18',
        note: 'Vendor payout for audit data.',
        status: 'approved',
        policyReason: 'Transfer is within the agent Safe auto-approval lane.',
        approvalsRequired: 1,
        approvalsReceived: 1,
        createdAt: '2026-03-24T12:20:00.000Z',
      },
    ],
    alerts: [
      {
        id: 'alert-1',
        severity: 'critical',
        title: 'Proof submission stalled',
        description: 'The last proof has been waiting for confirmation for 12 minutes.',
        source: 'proof-worker',
        timestamp: '2 min ago',
        resolved: false,
      },
    ],
    guardrails: [
      {
        id: 'guardrail-1',
        name: 'Execution rate limiter',
        description: 'Caps automatic retries for unstable agent runs.',
        status: 'active',
        triggeredCount: 12,
      },
    ],
    auditLog: [
      {
        timestamp: '12:35:00',
        action: 'ALERT_CREATED',
        actor: 'system',
        target: 'proof-worker',
        result: 'FLAG',
      },
    ],
  });

  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expectNoViewportOverflow(page);

  await page.goto('/app/marketplace');
  await expect(page.getByRole('heading', { name: 'Agent Marketplace' })).toBeVisible();
  await page.getByRole('button', { name: 'Register Agent' }).click();
  await expect(page.getByRole('heading', { name: 'Register Agent' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Register Agent' }).last()).toBeVisible();
  await expectNoViewportOverflow(page);

  await page.goto('/app/tasks');
  await page.getByRole('button', { name: 'Completed (1)' }).click();
  await page.getByRole('button', { name: 'View Result' }).click();
  await expect(page.getByRole('heading', { name: 'Contract audit report' }).last()).toBeVisible();
  await expect(page.getByText('Critical auth bypass')).toBeVisible();
  await expectNoViewportOverflow(page);
  await page.getByRole('button', { name: 'Close task result' }).click();

  await page.goto('/app/wallet');
  await expect(page.getByRole('heading', { name: 'Wallet & Payments' })).toBeVisible();
  await expect(page.getByText('Agent Safe Transfer Queue')).toBeVisible();
  await expect(page.getByText('Vendor payout for audit data.').first()).toBeVisible();
  await expectNoViewportOverflow(page);

  await page.goto('/app/security');
  await expect(page.getByRole('heading', { name: 'Security Center' })).toBeVisible();
  await expect(page.getByText('Proof submission stalled')).toBeVisible();
  await expect(page.getByText('ALERT_CREATED').first()).toBeVisible();
  await expectNoViewportOverflow(page);
});
