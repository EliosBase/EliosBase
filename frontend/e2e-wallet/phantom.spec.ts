import { expect, test } from '@playwright/test';
import { mockAppApi } from '../e2e/support/mockApi';
import {
  approvePhantomConnect,
  approvePhantomSignature,
  chooseWalletExtension,
  launchPhantom,
  recoverPhantomUnsupportedAccount,
} from './support/synpressWallets';

const walletStats = {
  balance: '0.00 ETH',
  balanceTrend: '0',
  inEscrow: '0.00 ETH',
  inEscrowTrend: '0',
  totalEarned: '0.00 ETH',
  totalEarnedTrend: '0',
  staked: '0.00 ETH',
  stakedTrend: '0',
};

test('connects and signs in with Phantom', async () => {
  const baseURL = String(test.info().project.use.baseURL);
  const { context, extensionId } = await launchPhantom();

  try {
    const page = await context.newPage();

    const openPhantomModal = async () => {
      await page.getByRole('button', { name: 'Connect Wallet' }).click();
      await page.locator('w3m-modal').waitFor({ state: 'visible' });
      await page.locator('w3m-modal').getByText('Phantom', { exact: true }).click();
      await chooseWalletExtension(context, 'Phantom');
    };

    await mockAppApi(page, {
      session: { authenticated: false },
      tasks: [],
      agents: [],
      activity: [],
      transactions: [],
      walletStats,
    });

    await page.goto(new URL('/app', baseURL).toString(), { waitUntil: 'networkidle' });
    await openPhantomModal();
    await approvePhantomConnect(context, extensionId);

    if (await recoverPhantomUnsupportedAccount(context, extensionId)) {
      await page.reload({ waitUntil: 'networkidle' });
      await openPhantomModal();
      await approvePhantomConnect(context, extensionId);
    }

    await approvePhantomSignature(context, extensionId);

    await expect(page.getByLabel('Disconnect wallet')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^0x[a-fA-F0-9]{4}\.\.\.[a-fA-F0-9]{4}$/).first()).toBeVisible();

    await page.goto(new URL('/app/wallet', baseURL).toString(), { waitUntil: 'networkidle' });
    await expect(page.getByText('Balance')).toBeVisible();
    await expect(page.getByText('0.00 ETH').first()).toBeVisible();
    await expect(page.getByText('Connect your wallet and sign in to view transactions.')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
