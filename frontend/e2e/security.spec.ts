import { expect, test } from '@playwright/test';
import { mockAppApi } from './support/mockApi';

test('shows the auth gate when security data is unavailable', async ({ page }) => {
  await mockAppApi(page, {
    session: { authenticated: false },
  });

  await page.goto('/app/security');
  await expect(page.getByText('Connect your wallet and sign in to view security data.')).toBeVisible();
});

test('resolves alerts and toggles guardrails for authenticated users', async ({ page }) => {
  await mockAppApi(page, {
    session: {
      authenticated: true,
      userId: 'operator-7',
      walletAddress: '0xbeef00000000000000000000000000000000cafe',
      chainId: 8453,
      role: 'operator',
    },
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

  await page.goto('/app/security');

  await expect(page.getByText('Threats Blocked')).toBeVisible();
  await expect(page.getByText('128')).toBeVisible();
  await expect(page.getByText('Proof submission stalled')).toBeVisible();

  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByText('Resolved')).toBeVisible();

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Activate' })).toBeVisible();
  await expect(page.getByText('GUARDRAIL_PAUSED')).toBeVisible();
});
