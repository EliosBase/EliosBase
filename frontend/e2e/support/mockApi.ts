import { type Page, type Route } from '@playwright/test';

type SessionData = {
  authenticated: boolean;
  userId?: string;
  walletAddress?: string;
  chainId?: number;
  role?: 'submitter' | 'operator' | 'admin';
};

type JsonRecord = Record<string, unknown>;

interface MockAppOptions {
  session?: SessionData;
  tasks?: JsonRecord[];
  taskResult?: JsonRecord | null;
  agents?: JsonRecord[];
  agentWalletTransfers?: JsonRecord[];
  stats?: JsonRecord;
  activity?: JsonRecord[];
  walletStats?: JsonRecord;
  transactions?: JsonRecord[];
  securityStats?: JsonRecord;
  alerts?: JsonRecord[];
  guardrails?: JsonRecord[];
  auditLog?: JsonRecord[];
  verifiedTasks?: string[];
  e2eWalletConnected?: boolean;
  onTaskCreate?: (body: JsonRecord) => void;
  onAgentRegister?: (body: JsonRecord) => void;
  onAgentHire?: (body: JsonRecord) => void;
  onTaskDispute?: (body: JsonRecord) => void;
  onTaskRefund?: (body: JsonRecord) => void;
  onTaskRelease?: (body: JsonRecord) => void;
  onTransactionSync?: (body: JsonRecord) => void;
}

const defaultSecurityStats = {
  threatsBlocked: 128,
  threatsBlockedTrend: '+12%',
  guardrailsActive: 4,
  guardrailsTotal: 5,
  guardrailsTrend: '+1',
  proofsVerified: 98,
  proofsTrend: '+8%',
  uptime: '99.98%',
  uptimeTrend: '+0.02%',
};

const defaultDashboardStats = {
  activeAgents: 18,
  activeAgentsTrend: '+12%',
  activeTasks: 7,
  activeTasksTrend: '+3',
  tvl: 12.42,
  tvlTrend: '+0.8 ETH',
  zkProofs: 241,
  zkProofsTrend: '+19%',
};

const defaultWalletStats = {
  balance: '3.21 ETH',
  balanceTrend: '+0.12 ETH',
  inEscrow: '0.45 ETH',
  inEscrowTrend: '+0.05 ETH',
  totalEarned: '8.80 ETH',
  totalEarnedTrend: '+0.20 ETH',
  staked: '1.50 ETH',
  stakedTrend: 'Stable',
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseBody(route: Route): JsonRecord {
  const raw = route.request().postData();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as JsonRecord;
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function mockAppApi(page: Page, options: MockAppOptions = {}) {
  let session = clone(options.session ?? { authenticated: false });
  const tasks = clone(options.tasks ?? []);
  const agents = clone(options.agents ?? []);
  const agentWalletTransfers = clone(options.agentWalletTransfers ?? []);
  const taskResult = options.taskResult ?? null;
  const stats = clone(options.stats ?? defaultDashboardStats);
  const activity = clone(options.activity ?? []);
  let walletStats = clone(options.walletStats ?? defaultWalletStats);
  const transactions = clone(options.transactions ?? []);
  const securityStats = clone(options.securityStats ?? defaultSecurityStats);
  let alerts = clone(options.alerts ?? []);
  let guardrails = clone(options.guardrails ?? []);
  let auditLog = clone(options.auditLog ?? []);

  await page.addInitScript(
    ({ connected, verifiedTasks, chainId }) => {
      window.sessionStorage.setItem('elios:e2e:wallet', JSON.stringify({
        connected,
        address: '0x123400000000000000000000000000000000abcd',
        chainId,
      }));
      window.sessionStorage.setItem('elios:e2e:verifiedTasks', JSON.stringify(verifiedTasks));
    },
    {
      connected: options.e2eWalletConnected ?? false,
      verifiedTasks: options.verifiedTasks ?? [],
      chainId: options.session?.chainId ?? 8453,
    },
  );

  await page.route('**/api/auth/session', (route) => fulfillJson(route, session));
  await page.route('**/api/auth/logout', (route) => {
    session = { authenticated: false };
    return fulfillJson(route, { authenticated: false });
  });

  await page.route('**/api/tasks/*/result', (route) => {
    if (!taskResult) {
      return fulfillJson(route, { error: 'Task result not found' }, 404);
    }

    return fulfillJson(route, taskResult);
  });

  await page.route('**/api/stats', (route) => fulfillJson(route, stats));
  await page.route('**/api/activity', (route) => fulfillJson(route, activity));
  await page.route('**/api/transactions', (route) => fulfillJson(route, transactions));
  await page.route('**/api/transactions/sync', (route) => {
    const body = parseBody(route);
    options.onTransactionSync?.(body);
    const txHash = String(body.txHash ?? `0xpayment-${transactions.length + 1}`);

    const syncedTransaction = {
      id: `tx-${txHash}`,
      type: body.type ?? 'payment',
      from: body.from ?? session.walletAddress ?? '0x1234',
      to: body.to ?? '0xrecipient',
      amount: body.amount ?? '0.00 ETH',
      token: body.token ?? 'ETH',
      status: 'confirmed',
      timestamp: '2026-03-24T12:15:00.000Z',
      txHash,
    };

    transactions.unshift(syncedTransaction);
    return fulfillJson(route, syncedTransaction, 201);
  });
  await page.route('**/api/wallet/stats', (route) => fulfillJson(route, walletStats));
  await page.route('**/api/agent-wallets', (route) => fulfillJson(route, {
    agents: agents.filter((agent) => agent.ownerId === session.userId),
    transfers: agentWalletTransfers,
    reviewQueue: session.role === 'operator' || session.role === 'admin'
      ? agentWalletTransfers.filter((transfer) => transfer.status === 'queued' || transfer.status === 'approved')
      : [],
  }));

  await page.route('**/api/tasks', (route) => {
    if (route.request().method() === 'POST') {
      const body = parseBody(route);
      options.onTaskCreate?.(body);

      const createdTask = {
        id: 'task-new',
        title: String(body.title ?? ''),
        description: String(body.description ?? ''),
        status: 'active',
        currentStep: 'Submitted',
        assignedAgent: 'Unassigned',
        reward: String(body.reward ?? ''),
        submittedAt: '2026-03-24T12:00:00.000Z',
        submitterId: session.userId ?? 'user-1',
      };

      tasks.unshift(createdTask);
      return fulfillJson(route, createdTask, 201);
    }

    return fulfillJson(route, tasks);
  });

  await page.route('**/api/tasks/*/release', (route) => {
    const taskId = route.request().url().split('/').at(-2);
    const body = parseBody(route);
    options.onTaskRelease?.(body);

    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return fulfillJson(route, { error: 'Task not found' }, 404);
    }

    transactions.unshift({
      id: `tx-release-${taskId}`,
      type: 'escrow_release',
      from: session.walletAddress ?? '0x1234',
      to: task.agentPayoutAddress ?? task.agentWalletAddress ?? task.agentOperatorAddress ?? task.assignedAgent ?? 'agent-safe',
      amount: task.reward,
      token: 'ETH',
      status: 'confirmed',
      timestamp: '2026-03-24T12:10:00.000Z',
      txHash: String(body.txHash ?? '0xrelease'),
    });
    walletStats = {
      ...walletStats,
      inEscrow: '0.00 ETH',
      inEscrowTrend: '-0.45 ETH',
    };

    return fulfillJson(route, {
      success: true,
      taskId,
      transactionId: `tx-release-${taskId}`,
      txStatus: 'confirmed',
    });
  });

  await page.route('**/api/tasks/*/refund', (route) => {
    const taskId = route.request().url().split('/').at(-2);
    const body = parseBody(route);
    options.onTaskRefund?.(body);

    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return fulfillJson(route, { error: 'Task not found' }, 404);
    }

    task.hasOpenDispute = false;
    transactions.unshift({
      id: `tx-refund-${taskId}`,
      type: 'escrow_refund',
      from: session.walletAddress ?? '0x1234',
      to: session.walletAddress ?? '0x1234',
      amount: task.reward,
      token: 'ETH',
      status: 'confirmed',
      timestamp: '2026-03-24T12:12:00.000Z',
      txHash: String(body.txHash ?? '0xrefund'),
    });
    walletStats = {
      ...walletStats,
      inEscrow: '0.00 ETH',
      inEscrowTrend: '-0.20 ETH',
    };

    return fulfillJson(route, {
      success: true,
      taskId,
      transactionId: `tx-refund-${taskId}`,
      txStatus: 'confirmed',
    });
  });

  await page.route('**/api/tasks/*/dispute', (route) => {
    const taskId = route.request().url().split('/').at(-2);
    const body = parseBody(route);
    options.onTaskDispute?.(body);

    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return fulfillJson(route, { error: 'Task not found' }, 404);
    }

    task.hasOpenDispute = true;
    alerts.unshift({
      id: `alert-dispute-${taskId}`,
      severity: 'medium',
      title: `Dispute opened for ${task.title ?? taskId}`,
      description: String(body.reason ?? ''),
      source: `Task Dispute · ${taskId}`,
      timestamp: 'just now',
      resolved: false,
    });

    return fulfillJson(route, {
      success: true,
      alertId: `alert-dispute-${taskId}`,
      taskId,
      hasOpenDispute: true,
    }, 201);
  });

  await page.route('**/api/agents/register', (route) => {
    const body = parseBody(route);
    options.onAgentRegister?.(body);

    const createdAgent = {
      id: 'agent-new',
      ownerId: session.userId ?? 'user-1',
      reputation: 100,
      tasksCompleted: 0,
      status: 'online',
      walletAddress: '0xsafe000000000000000000000000000000000001',
      walletKind: 'safe',
      walletStatus: 'active',
      walletPolicy: {
        standard: 'safe',
        owner: session.walletAddress ?? '0x123400000000000000000000000000000000abcd',
        policySigner: '0xsafe00000000000000000000000000000000sign',
        owners: [
          session.walletAddress ?? '0x123400000000000000000000000000000000abcd',
          '0xsafe00000000000000000000000000000000sign',
        ],
        threshold: 2,
        dailySpendLimitEth: '0.50',
        coSignThresholdEth: '0.25',
        timelockThresholdEth: '1.00',
        timelockSeconds: 86400,
        blockedDestinations: [],
      },
      ...body,
    };

    agents.unshift(createdAgent);
    return fulfillJson(route, createdAgent, 201);
  });

  await page.route('**/api/agents/*/wallet/transfers', (route) => {
    if (route.request().method() === 'GET') {
      return fulfillJson(route, agentWalletTransfers);
    }

    const agentId = route.request().url().split('/').at(-3) ?? 'agent';
    const body = parseBody(route);
    const amountEth = String(body.amountEth ?? '0.00');
    const transfer = {
      id: `awt-${agentWalletTransfers.length + 1}`,
      agentId,
      safeAddress: '0xsafe000000000000000000000000000000000001',
      destination: String(body.destination ?? ''),
      amountEth,
      note: String(body.note ?? ''),
      status: parseFloat(amountEth) >= 0.25 ? 'queued' : 'approved',
      policyReason: parseFloat(amountEth) >= 0.25
        ? 'Transfer requires operator co-approval before Safe execution.'
        : 'Transfer is within the agent Safe auto-approval lane.',
      approvalsRequired: parseFloat(amountEth) >= 0.25 ? 2 : 1,
      approvalsReceived: 1,
      unlockAt: null,
      createdAt: '2026-03-24T12:20:00.000Z',
    };

    agentWalletTransfers.unshift(transfer);
    return fulfillJson(route, transfer, transfer.status === 'queued' ? 202 : 201);
  });

  await page.route('**/api/agents/*/wallet/transfers/*/prepare', (route) => {
    const transferId = route.request().url().split('/').at(-2);
    const transfer = agentWalletTransfers.find((entry) => entry.id === transferId);
    if (!transfer) {
      return fulfillJson(route, { error: 'Transfer not found' }, 404);
    }

    return fulfillJson(route, {
      safeTxHash: `0x${'1'.repeat(64)}`,
      chainId: 8453,
      safeVersion: '1.4.1',
      txData: {
        to: transfer.destination,
        value: `${BigInt(Math.round(Number(transfer.amountEth) * 1e6)) * 10n ** 12n}`,
        data: '0x',
        operation: 0,
        safeTxGas: '0',
        baseGas: '0',
        gasPrice: '0',
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
        nonce: 0,
      },
    });
  });

  await page.route('**/api/agents/*/wallet/transfers/*/execute', (route) => {
    const transferId = route.request().url().split('/').at(-2);
    const transfer = agentWalletTransfers.find((entry) => entry.id === transferId);
    if (!transfer) {
      return fulfillJson(route, { error: 'Transfer not found' }, 404);
    }

    transfer.status = 'executed';
    transfer.executedAt = '2026-03-24T12:25:00.000Z';
    transfer.executedBy = session.userId ?? 'user-1';
    transfer.txHash = '0xsafeexecute';

    transactions.unshift({
      id: `tx-safe-${transferId}`,
      type: 'payment',
      from: transfer.safeAddress,
      to: transfer.destination,
      amount: `${transfer.amountEth} ETH`,
      token: 'ETH',
      status: 'confirmed',
      timestamp: '2026-03-24T12:25:00.000Z',
      txHash: transfer.txHash,
    });

    return fulfillJson(route, {
      transfer,
      txHash: transfer.txHash,
    });
  });

  await page.route('**/api/agents/*/wallet/transfers/*/approve', (route) => {
    const transferId = route.request().url().split('/').at(-2);
    const transfer = agentWalletTransfers.find((entry) => entry.id === transferId);
    if (!transfer) {
      return fulfillJson(route, { error: 'Transfer not found' }, 404);
    }

    transfer.status = 'approved';
    transfer.approvalsReceived = transfer.approvalsRequired;
    transfer.approvedAt = '2026-03-24T12:22:00.000Z';
    transfer.approvedBy = session.userId ?? 'user-1';

    return fulfillJson(route, transfer);
  });

  await page.route('**/api/agents/*/hire', (route) => {
    const agentId = route.request().url().split('/').at(-2);
    const body = parseBody(route);
    options.onAgentHire?.(body);

    const agent = agents.find((entry) => entry.id === agentId);
    if (!agent) {
      return fulfillJson(route, { error: 'Agent not found' }, 404);
    }

    agent.status = 'busy';

    const task = tasks.find((entry) => entry.id === body.taskId);
    if (task) {
      task.assignedAgent = String(agent.name ?? agentId);
      task.currentStep = 'Assigned';
    }

    transactions.unshift({
      id: `tx-hire-${agentId}`,
      type: 'escrow_lock',
      from: session.walletAddress ?? '0x1234',
      to: agentId ?? 'agent',
      amount: agent.pricePerTask ?? '0.00 ETH',
      token: 'ETH',
      status: 'confirmed',
      timestamp: '2026-03-24T12:05:00.000Z',
      txHash: String(body.txHash ?? '0xhire'),
    });
    walletStats = {
      ...walletStats,
      inEscrow: agent.pricePerTask ?? walletStats.inEscrow,
      inEscrowTrend: '+0.12 ETH',
    };

    return fulfillJson(route, {
      success: true,
      agentId,
      transactionId: `tx-hire-${agentId}`,
      agentName: agent.name,
      txHash: body.txHash,
      txStatus: 'confirmed',
    }, 201);
  });

  await page.route(/\/api\/agents(?:\?.*)?$/, (route) => fulfillJson(route, agents));

  await page.route('**/api/security/stats', (route) => fulfillJson(route, securityStats));

  await page.route('**/api/security/alerts/*', (route) => {
    const alertId = route.request().url().split('/').at(-1);
    const body = parseBody(route);

    alerts = alerts.map((alert) => {
      if (alert.id !== alertId) {
        return alert;
      }

      return {
        ...alert,
        resolved: body.resolved === true,
      };
    });

    const updatedAlert = alerts.find((alert) => alert.id === alertId);
    return fulfillJson(route, updatedAlert ?? { error: 'Alert not found' }, updatedAlert ? 200 : 404);
  });

  await page.route('**/api/security/alerts', (route) => fulfillJson(route, alerts));

  await page.route('**/api/security/guardrails/*', (route) => {
    const guardrailId = route.request().url().split('/').at(-1);
    const body = parseBody(route);

    guardrails = guardrails.map((guardrail) => {
      if (guardrail.id !== guardrailId) {
        return guardrail;
      }

      return {
        ...guardrail,
        status: body.status,
      };
    });

    const updatedGuardrail = guardrails.find((guardrail) => guardrail.id === guardrailId);
    if (updatedGuardrail) {
      auditLog = [
        {
          timestamp: '12:40:00',
          action: `GUARDRAIL_${String(body.status).toUpperCase()}`,
          actor: 'operator',
          target: updatedGuardrail.name,
          result: 'ALLOW',
        },
        ...auditLog,
      ];
    }

    return fulfillJson(route, updatedGuardrail ?? { error: 'Guardrail not found' }, updatedGuardrail ? 200 : 404);
  });

  await page.route('**/api/security/guardrails', (route) => fulfillJson(route, guardrails));
  await page.route('**/api/security/audit-log', (route) => fulfillJson(route, auditLog));
}
