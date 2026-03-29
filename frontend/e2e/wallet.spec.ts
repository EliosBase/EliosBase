import { expect, test } from '@playwright/test';
import { mockAppApi } from './support/mockApi';

test('shows the auth gate when wallet data is unavailable', async ({ page }) => {
  await mockAppApi(page, {
    session: { authenticated: false },
  });

  await page.goto('/app/wallet');
  await expect(page.getByText('Connect your wallet and sign in to view transactions.')).toBeVisible();
});

test('renders wallet stats, smart-wallet capabilities, and transaction history', async ({ page }) => {
  await mockAppApi(page, {
    session: {
      authenticated: true,
      userId: 'user-1',
      walletAddress: '0x123400000000000000000000000000000000abcd',
      chainId: 84532,
      role: 'submitter',
    },
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
    transactions: [
      {
        id: 'tx-1',
        type: 'escrow_lock',
        from: '0x1234',
        to: 'agent-1',
        amount: '0.15 ETH',
        token: 'ETH',
        status: 'confirmed',
        timestamp: '2026-03-24T11:00:00.000Z',
        txHash: '0xlock',
      },
      {
        id: 'tx-2',
        type: 'escrow_release',
        from: '0x1234',
        to: '0xagent',
        amount: '0.25 ETH',
        token: 'ETH',
        status: 'pending',
        timestamp: '2026-03-24T12:00:00.000Z',
        txHash: '0xrelease',
      },
    ],
  });

  await page.goto('/app/wallet');

  await expect(page.getByText('Balance')).toBeVisible();
  await expect(page.getByText('3.21 ETH')).toBeVisible();
  await expect(page.getByText('ERC-7579 Smart Wallet')).toBeVisible();
  await expect(page.getByText('Spending Limits')).toBeVisible();
  await expect(page.getByText('Multi-Sig (2/3)')).toBeVisible();
  await expect(page.getByText('Transaction History')).toBeVisible();
  await expect(page.getByText('Escrow Lock')).toBeVisible();
  await expect(page.getByText('Escrow Release')).toBeVisible();
  await expect(page.getByText('pending', { exact: true })).toBeVisible();
});

test('withdraws eth from the connected wallet and records the payout', async ({ page }) => {
  await mockAppApi(page, {
    session: {
      authenticated: true,
      userId: 'user-1',
      walletAddress: '0x123400000000000000000000000000000000abcd',
      chainId: 8453,
      role: 'submitter',
    },
    e2eWalletConnected: true,
    transactions: [],
  });

  await page.goto('/app/wallet');
  await page.getByPlaceholder('0x...').fill('0xfeed00000000000000000000000000000000beef');
  await page.getByPlaceholder('0.00').fill('0.05');
  await page.getByRole('button', { name: 'Withdraw ETH' }).click();

  await expect(page.getByRole('button', { name: 'Sent' })).toBeVisible();
  const paymentRow = page
    .locator('div.flex.items-center.gap-4')
    .filter({ has: page.getByText('Payment', { exact: true }) })
    .filter({ has: page.getByText('0.05 ETH', { exact: true }) })
    .first();
  await expect(paymentRow).toBeVisible();
});
