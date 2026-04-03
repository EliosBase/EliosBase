import { expect, test, type Page } from '@playwright/test';
import { mockAppApi } from '../e2e/support/mockApi';
import {
  approveMetaMaskConnect,
  approveMetaMaskSignature,
  launchMetaMask,
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

async function resetWalletClientState(page: Page) {
  await page.addInitScript(() => {
    const prefixes = ['@appkit/', 'wagmi', 'base-acc-sdk', 'walletconnect', 'WCM_'];

    try {
      for (const key of Object.keys(window.localStorage)) {
        if (prefixes.some((prefix) => key.startsWith(prefix))) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore storage access failures inside the browser context.
    }

    try {
      window.sessionStorage.clear();
    } catch {
      // Ignore storage access failures inside the browser context.
    }
  });
}

async function disconnectIfNeeded(page: Page) {
  const disconnectButton = page.getByLabel('Disconnect wallet');
  if (!(await disconnectButton.isVisible().catch(() => false))) {
    return;
  }

  await disconnectButton.click();
  await expect(page.getByRole('button', { name: 'Connect Wallet' })).toBeVisible({ timeout: 30_000 });
}

async function connectWithMetaMask(page: Page) {
  await expect(page.getByRole('button', { name: 'Connect Wallet' }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Connect Wallet' }).first().click();

  const walletButton = page.getByRole('button', { name: 'MetaMask' }).first();
  await expect(walletButton).toBeVisible({ timeout: 30_000 });
  await walletButton.evaluate((button: HTMLButtonElement) => {
    button.click();
  });
}

test('connects and signs in with MetaMask', async () => {
  const baseURL = String(test.info().project.use.baseURL);
  const { context, extensionId } = await launchMetaMask();

  try {
    const page = await context.newPage();
    await resetWalletClientState(page);

    await mockAppApi(page, {
      session: { authenticated: false },
      tasks: [],
      agents: [],
      activity: [],
      transactions: [],
      walletStats,
    });

    await page.goto(new URL('/app', baseURL).toString(), { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/app(?:\?|#|$)/, { timeout: 30_000 });
    await disconnectIfNeeded(page);
    await connectWithMetaMask(page);
    await approveMetaMaskConnect(context, extensionId);
    const verifyResponse = page.waitForResponse((response) => (
      response.url().includes('/api/auth/verify')
      && response.request().method() === 'POST'
    ), { timeout: 30_000 });
    await approveMetaMaskSignature(context, extensionId);
    await verifyResponse;
    await expect.poll(async () => page.evaluate(async () => {
      try {
        const response = await fetch('/api/auth/session');
        const body = await response.json();
        return body?.authenticated === true;
      } catch {
        return false;
      }
    }), { timeout: 30_000 }).toBe(true);

    await expect(page.getByLabel('Disconnect wallet')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^0x[a-fA-F0-9]{4}\.\.\.[a-fA-F0-9]{4}$/).first()).toBeVisible();

    await page.goto(new URL('/app/wallet', baseURL).toString(), { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/app\/wallet(?:\?|#|$)/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Wallet & Payments' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Balance')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('0.00 ETH').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Connect your wallet and sign in to view transactions.')).toHaveCount(0, { timeout: 30_000 });
  } finally {
    await context.close();
  }
});
