import { describe, expect, it } from 'vitest';
import type { Agent, Task } from '@/lib/types';
import type { DbActivityEvent, DbAuditLogEntry, DbSecurityAlert, DbTransaction } from '@/lib/types';
import {
  buildAgentPassport,
  buildGraphActivityEvents,
  buildTaskReceipt,
  encodeGraphCursor,
  paginateGraphActivityEvents,
} from '@/lib/web4Graph';

const urls = {
  siteUrl: 'https://preview.eliosbase.net',
  framesBaseUrl: 'https://preview.eliosbase.net',
};

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'ag-1',
    name: 'Proof Runner',
    description: 'Verifiable execution for Base tasks.',
    capabilities: ['proofs', 'escrow'],
    reputation: 92,
    tasksCompleted: 128,
    pricePerTask: '0.15 ETH',
    status: 'online',
    type: 'executor',
    walletAddress: '0x1234567890123456789012345678901234567890',
    walletStandard: 'safe7579',
    walletStatus: 'ready',
    walletPolicy: {
      standard: 'safe7579',
      owner: '0x1234567890123456789012345678901234567890',
      policySigner: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      owners: [
        '0x1234567890123456789012345678901234567890',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      ],
      threshold: 2,
      dailySpendLimitEth: '0.5',
      autoApproveThresholdEth: '0.05',
      reviewThresholdEth: '0.10',
      timelockThresholdEth: '0.25',
      timelockSeconds: 3600,
      blockedDestinations: ['0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed'],
      allowlistedContracts: ['0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef'],
    },
    walletSession: {
      address: '0x9999999999999999999999999999999999999999',
      validUntil: '2099-01-01T00:00:00.000Z',
      rotatedAt: '2026-04-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-101',
    title: 'Protocol receipt verification',
    description: 'Verify that Elios exposes canonical Web4 receipts.',
    status: 'completed',
    currentStep: 'Complete',
    assignedAgent: 'Proof Runner',
    reward: '0.15 ETH',
    submittedAt: '2026-04-01T12:00:00.000Z',
    completedAt: '2026-04-01T13:00:00.000Z',
    zkProofId: 'zk-proof-101',
    zkVerifyTxHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    submitterId: 'user-1',
    agentWalletAddress: '0x1234567890123456789012345678901234567890',
    agentPayoutAddress: '0x1234567890123456789012345678901234567890',
    hasOpenDispute: false,
    ...overrides,
  };
}

describe('web4Graph', () => {
  it('builds an agent passport with transparent trust metrics', () => {
    const agent = makeAgent();
    const assignedTasks = [
      makeTask(),
      makeTask({
        id: 'task-102',
        title: 'Pending task',
        status: 'active',
        currentStep: 'Executing',
        completedAt: undefined,
        zkProofId: undefined,
        zkVerifyTxHash: undefined,
      }),
    ];
    const activityRows: DbActivityEvent[] = [
      {
        id: 'ev-1',
        type: 'agent',
        message: 'Proof Runner completed 2,100th task milestone',
        timestamp: '2026-04-02T10:00:00.000Z',
        user_id: null,
      },
    ];
    const transactions: DbTransaction[] = [
      {
        id: 'tx-1',
        type: 'escrow_release',
        from: 'Escrow Vault',
        to: 'Proof Runner Safe',
        amount: '0.15 ETH',
        token: 'ETH',
        status: 'confirmed',
        timestamp: '2026-04-01T13:05:00.000Z',
        tx_hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        user_id: 'user-1',
      },
    ];
    const alerts: DbSecurityAlert[] = [];

    const passport = buildAgentPassport({
      agent,
      assignedTasks,
      activityRows,
      transactions,
      alerts,
      urls,
    });

    expect(passport.pageUrl).toBe('https://preview.eliosbase.net/agents/ag-1');
    expect(passport.frameUrl).toBe('https://preview.eliosbase.net/api/frames/agent/ag-1');
    expect(passport.trust.reputationBreakdown.walletSafetyScore).toBe(100);
    expect(passport.trust.badges).toEqual(
      expect.arrayContaining(['zk-verified', 'policy-guarded', 'session-active']),
    );
    expect(passport.activity[0]?.entityId).toBe('ag-1');
  });

  it('builds a task receipt with canonical links and timeline events', () => {
    const task = makeTask({ hasOpenDispute: true });
    const agent = makeAgent();
    const activityRows: DbActivityEvent[] = [
      {
        id: 'ev-2',
        type: 'proof',
        message: 'ZK proof generated for: Protocol receipt verification',
        timestamp: '2026-04-01T13:01:00.000Z',
        user_id: null,
      },
    ];
    const auditRows: DbAuditLogEntry[] = [
      {
        id: 1,
        timestamp: '2026-04-01T13:03:00.000Z',
        action: 'ESCROW_RELEASE',
        actor: 'user-1',
        target: 'task-101',
        result: 'ALLOW',
      },
    ];
    const alerts: DbSecurityAlert[] = [
      {
        id: 'alert-1',
        severity: 'medium',
        title: 'Task dispute opened',
        description: 'A manual dispute was opened for review.',
        source: 'Task Dispute · task-101',
        timestamp: '2026-04-01T13:10:00.000Z',
        resolved: false,
      },
    ];
    const transactions: DbTransaction[] = [
      {
        id: 'tx-2',
        type: 'escrow_lock',
        from: 'user-1',
        to: 'ag-1',
        amount: '0.15 ETH',
        token: 'ETH',
        status: 'confirmed',
        timestamp: '2026-04-01T12:01:00.000Z',
        tx_hash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        user_id: 'user-1',
      },
      {
        id: 'tx-3',
        type: 'escrow_release',
        from: 'Escrow Vault',
        to: 'Proof Runner Safe',
        amount: '0.15 ETH',
        token: 'ETH',
        status: 'confirmed',
        timestamp: '2026-04-01T13:04:00.000Z',
        tx_hash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        user_id: 'user-1',
      },
    ];

    const receipt = buildTaskReceipt({
      task,
      agent,
      activityRows,
      auditRows,
      alerts,
      transactions,
      urls,
    });

    expect(receipt.pageUrl).toBe('https://preview.eliosbase.net/tasks/task-101');
    expect(receipt.escrow.escrowStatus).toBe('released');
    expect(receipt.proof.proofStatus).toBe('verified');
    expect(receipt.timeline.some((event) => event.txHash === transactions[1].tx_hash)).toBe(true);
  });

  it('paginates graph activity events with a cursor', () => {
    const task = makeTask({ id: 'task-201', title: 'Task one' });
    const activityRows: DbActivityEvent[] = [
      {
        id: 'ev-10',
        type: 'task',
        message: 'Task completed: Task one',
        timestamp: '2026-04-02T12:00:00.000Z',
        user_id: null,
      },
      {
        id: 'ev-11',
        type: 'task',
        message: 'Task deleted: task-201',
        timestamp: '2026-04-02T11:00:00.000Z',
        user_id: null,
      },
      {
        id: 'ev-12',
        type: 'task',
        message: 'Task "Task one" moved to Executing',
        timestamp: '2026-04-02T10:00:00.000Z',
        user_id: null,
      },
    ];

    const events = buildGraphActivityEvents({
      activityRows,
      tasks: [task],
      agents: [],
      urls,
    });
    const firstPage = paginateGraphActivityEvents(events, {
      limit: 2,
      entityType: 'task',
      entityId: 'task-201',
    });

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = paginateGraphActivityEvents(events, {
      limit: 2,
      entityType: 'task',
      entityId: 'task-201',
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.items).toHaveLength(1);
    expect(encodeGraphCursor(firstPage.items[1])).toBe(firstPage.nextCursor);
  });
});
