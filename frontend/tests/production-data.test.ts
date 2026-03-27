import { describe, expect, it } from 'vitest';
import { collapseNoisyActivity, dedupeSignerBalanceAlerts, isSmokeTask } from '@/lib/productionData';

describe('productionData', () => {
  it('recognizes smoke tasks', () => {
    expect(isSmokeTask({
      title: 'Smoke E2E 1774470655203',
      description: 'Temporary live task to verify the deployed execution pipeline.',
    })).toBe(true);

    expect(isSmokeTask({
      title: 'Governance proposal summarization',
      description: 'NLP analysis of 47 pending DAO governance proposals',
    })).toBe(false);
  });

  it('collapses duplicate signer-balance activity and removes smoke events', () => {
    const rows = collapseNoisyActivity([
      { message: 'Security alert: Proof signer balance low' },
      { message: 'Security alert: Proof signer balance low' },
      { message: 'Task "Smoke E2E 1774470655203" advanced to Complete' },
      { message: 'Task completed: Real task' },
    ]);

    expect(rows).toEqual([
      { message: 'Security alert: Proof signer balance low' },
      { message: 'Task completed: Real task' },
    ]);
  });

  it('keeps only the latest unresolved signer-balance alert', () => {
    const rows = dedupeSignerBalanceAlerts([
      { title: 'Proof signer balance low', source: 'Signer Balance Monitor', resolved: false, id: 'latest' },
      { title: 'Proof signer balance low', source: 'Signer Balance Monitor', resolved: false, id: 'older' },
      { title: 'Proof signer balance low', source: 'Signer Balance Monitor', resolved: true, id: 'resolved' },
      { title: 'Spending limit exceeded', source: 'Guardrail System', resolved: false, id: 'other' },
    ]);

    expect(rows).toEqual([
      { title: 'Proof signer balance low', source: 'Signer Balance Monitor', resolved: false, id: 'latest' },
      { title: 'Proof signer balance low', source: 'Signer Balance Monitor', resolved: true, id: 'resolved' },
      { title: 'Spending limit exceeded', source: 'Guardrail System', resolved: false, id: 'other' },
    ]);
  });
});
