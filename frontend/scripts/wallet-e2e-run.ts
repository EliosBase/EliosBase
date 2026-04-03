import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BrowserContext, Page } from '@playwright/test';

type WalletKind = 'coinbase' | 'metamask' | 'phantom';

type WalletLaunch = {
  context: BrowserContext;
  extensionId: string;
};

type WalletModule = {
  launchCoinbase: () => Promise<WalletLaunch>;
  launchMetaMask: () => Promise<WalletLaunch>;
  launchPhantom: () => Promise<WalletLaunch>;
  ensureCoinbaseUnlocked: (context: BrowserContext, extensionId: string) => Promise<void>;
  ensureMetaMaskUnlocked: (context: BrowserContext, extensionId: string) => Promise<void>;
  ensurePhantomUnlocked: (context: BrowserContext, extensionId: string) => Promise<void>;
  approveCoinbaseConnect: (context: BrowserContext, extensionId: string) => Promise<void>;
  approveCoinbaseSignature: (context: BrowserContext, extensionId: string) => Promise<void>;
  approveMetaMaskConnect: (context: BrowserContext, extensionId: string) => Promise<void>;
  approveMetaMaskSignature: (context: BrowserContext, extensionId: string) => Promise<void>;
  approvePhantomConnect: (context: BrowserContext, extensionId: string) => Promise<void>;
  approvePhantomSignature: (context: BrowserContext, extensionId: string) => Promise<void>;
  recoverPhantomUnsupportedAccount: (context: BrowserContext, extensionId: string) => Promise<boolean>;
  selectPhantomAccount: (context: BrowserContext, extensionId: string, label: string) => Promise<boolean>;
};

type WalletConfig = Record<
  WalletKind,
  {
    displayName: string;
    launch: () => Promise<WalletLaunch>;
    approveConnect: (context: BrowserContext, extensionId: string) => Promise<void>;
    approveSignature: (context: BrowserContext, extensionId: string) => Promise<void>;
  }
>;

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:34118';
const metaMaskExtensionId = 'nkbihfbeogaeaoehlefnkodbefgpgknn';
const phantomExtensionId = 'bfnaelmomeimhlpmgjnjophhpkkoljpa';
const coinbaseExtensionId = 'hnfanknocfeofbddgcijnmhnfnkdnaad';
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
const execFileAsync = promisify(execFile);

function isWalletKind(value: string): value is WalletKind {
  return value === 'coinbase' || value === 'metamask' || value === 'phantom';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T) {
  return Promise.race([
    promise,
    sleep(ms).then(() => fallback),
  ]);
}

async function focusChromeApp() {
  await execFileAsync('osascript', ['-e', 'tell application "Google Chrome" to activate']).catch(() => {});
  await sleep(250);
}

async function waitUntil<T>(
  label: string,
  fn: () => Promise<T | null | false | undefined>,
  timeout = 30_000,
  interval = 250,
) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const value = await fn();
    if (value) {
      return value;
    }

    await sleep(interval);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

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
      void 0;
    }

    try {
      window.sessionStorage.clear();
    } catch {
      void 0;
    }
  });
}

async function disconnectIfNeeded(page: Page) {
  const disconnectButton = page.getByLabel('Disconnect wallet');
  const visible = await disconnectButton.isVisible().catch(() => false);

  if (visible) {
    await disconnectButton.click();
  }
}

async function readWalletState(page: Page) {
  return page.evaluate(() => {
    return (window as typeof window & { __ELIOS_WALLET_STATE__?: unknown }).__ELIOS_WALLET_STATE__ ?? null;
  });
}

async function readWalletUiEvents(page: Page) {
  return page.evaluate(() => {
    return (window as typeof window & { __ELIOS_WALLET_UI_EVENTS__?: unknown }).__ELIOS_WALLET_UI_EVENTS__ ?? [];
  });
}

function expectedConnectorId(displayName: string) {
  if (displayName === 'MetaMask') {
    return 'metaMask';
  }

  if (displayName === 'Phantom') {
    return 'phantom';
  }

  if (displayName === 'Coinbase Wallet') {
    return 'coinbaseWalletSDK';
  }

  return null;
}

async function waitForWalletHelper(page: Page) {
  await waitUntil('wallet helper', async () => {
    return page.evaluate(() => {
      const browserWindow = window as typeof window & {
        __ELIOS_CONNECT_WALLET__?: unknown;
        __ELIOS_WALLET_STATE__?: unknown;
      };

      return typeof browserWindow.__ELIOS_CONNECT_WALLET__ === 'function'
        && browserWindow.__ELIOS_WALLET_STATE__ !== undefined;
    }).catch(() => false);
  });
}

function hasWalletTransition(context: BrowserContext, displayName: string) {
  const urls = context.pages().map((entry) => entry.url());

  if (displayName === 'MetaMask') {
    return urls.some((url) => {
      return url.startsWith(`chrome-extension://${coinbaseExtensionId}/`) && url.includes('action=selectProvider')
        || url.startsWith(`chrome-extension://${metaMaskExtensionId}/notification.html`);
    });
  }

  if (displayName === 'Phantom') {
    return urls.some((url) => {
      return url.startsWith(`chrome-extension://${coinbaseExtensionId}/`) && url.includes('action=selectProvider')
        || url.startsWith(`chrome-extension://${phantomExtensionId}/notification.html`);
    });
  }

  if (displayName === 'Coinbase Wallet') {
    return urls.some((url) => {
      return url.startsWith(`chrome-extension://${coinbaseExtensionId}/`)
        && (url.includes('action=selectProvider') || /request|approval|sign|connect|popup/i.test(url));
    });
  }

  return false;
}

async function waitForWalletTransition(page: Page, displayName: string, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  const connectorId = expectedConnectorId(displayName);

  while (Date.now() < deadline) {
    if (hasWalletTransition(page.context(), displayName)) {
      return true;
    }

    const walletState = await withTimeout(readWalletState(page).catch(() => null), 250, null) as {
      connectorId?: string | null;
      connectError?: string | null;
      isConnected?: boolean;
      isConnecting?: boolean;
    } | null;

    if (walletState?.isConnected) {
      return true;
    }

    if (walletState?.isConnecting) {
      return true;
    }

    if (connectorId && walletState?.connectorId === connectorId) {
      return true;
    }

    if (walletState?.connectError) {
      console.log('STEP', 'choose-wallet:connect-error', walletState.connectError);
      return true;
    }

    await sleep(200);
  }

  return false;
}

async function chooseWalletFromMenu(page: Page, displayName: string) {
  const connectButton = page.getByRole('button', { name: 'Connect Wallet' }).first();
  await connectButton.waitFor({ state: 'visible', timeout: 30_000 });
  console.log('STEP', 'choose-wallet:connect-ready');
  await focusChromeApp();
  await page.bringToFront();
  await connectButton.click();
  console.log('STEP', 'choose-wallet:connect-clicked');

  const walletButton = page.getByRole('button', { name: displayName }).first();
  await walletButton.waitFor({ state: 'visible', timeout: 30_000 });
  console.log('STEP', 'choose-wallet:wallet-ready', displayName);

  await walletButton.scrollIntoViewIfNeeded().catch(() => {});
  await walletButton.hover().catch(() => {});

  const walletBox = await withTimeout(walletButton.boundingBox(), 2_000, null);
  if (walletBox) {
    void page.mouse.click(
      walletBox.x + (walletBox.width / 2),
      walletBox.y + (walletBox.height / 2),
    ).catch((error) => {
      console.log('STEP', 'choose-wallet:wallet-click-error', `${displayName}:mouse:${String(error)}`);
    });

    if (await waitForWalletTransition(page, displayName, 10_000)) {
      console.log('STEP', 'choose-wallet:wallet-clicked', `${displayName}:mouse-transition`);
      await sleep(1_000);
      return;
    }

    console.log('STEP', 'choose-wallet:wallet-click-timeout', `${displayName}:mouse`);
  }

  void walletButton.click({ force: true, timeout: 2_000 }).catch((error) => {
    console.log('STEP', 'choose-wallet:wallet-click-error', `${displayName}:force:${String(error)}`);
  });

  if (await waitForWalletTransition(page, displayName, 10_000)) {
    console.log('STEP', 'choose-wallet:wallet-clicked', `${displayName}:force-transition`);
    await sleep(1_000);
    return;
  }

  const helperClicked = await withTimeout(page.evaluate((walletName) => {
    const browserWindow = window as typeof window & {
      __ELIOS_CONNECT_WALLET__?: (walletId: string) => void;
    };

    const walletId = walletName === 'MetaMask'
      ? 'metaMask'
      : walletName === 'Phantom'
        ? 'phantom'
        : 'coinbaseWallet';

    if (typeof browserWindow.__ELIOS_CONNECT_WALLET__ !== 'function') {
      return false;
    }

    browserWindow.__ELIOS_CONNECT_WALLET__(walletId);
    return true;
  }, displayName).catch(() => false), 500, false);

  if (helperClicked && await waitForWalletTransition(page, displayName, 10_000)) {
    console.log('STEP', 'choose-wallet:wallet-clicked', `${displayName}:helper-transition`);
    await sleep(1_000);
    return;
  }

  console.log(
    'STEP',
    'choose-wallet:wallet-events',
    JSON.stringify(await withTimeout(readWalletUiEvents(page).catch(() => []), 500, [])),
  );
  console.log(
    'STEP',
    'choose-wallet:wallet-state',
    JSON.stringify(await withTimeout(readWalletState(page).catch(() => null), 500, null)),
  );

  throw new Error(`Failed to click wallet option ${displayName}`);
}

async function verifyWalletPage(page: Page) {
  await page.goto(`${baseURL}/app/wallet`, { waitUntil: 'domcontentloaded' });
  await waitUntil('wallet page heading', async () => {
    return page.getByRole('heading', { name: 'Wallet & Payments' }).isVisible().catch(() => false);
  });
}

async function runWalletFlow(
  walletKind: WalletKind,
  walletMod: WalletModule,
  mockAppApi: (page: Page, options: Record<string, unknown>) => Promise<void>,
) {
  const walletConfig: WalletConfig = {
    coinbase: {
      displayName: 'Coinbase Wallet',
      launch: walletMod.launchCoinbase,
      approveConnect: walletMod.approveCoinbaseConnect,
      approveSignature: walletMod.approveCoinbaseSignature,
    },
    metamask: {
      displayName: 'MetaMask',
      launch: walletMod.launchMetaMask,
      approveConnect: walletMod.approveMetaMaskConnect,
      approveSignature: walletMod.approveMetaMaskSignature,
    },
    phantom: {
      displayName: 'Phantom',
      launch: walletMod.launchPhantom,
      approveConnect: walletMod.approvePhantomConnect,
      approveSignature: walletMod.approvePhantomSignature,
    },
  } as const;
  const config = walletConfig[walletKind];
  const launched = await config.launch();
  const { context, extensionId } = launched;

  try {
    console.log('STEP', 'newPage:start');
    const page = await context.newPage();
    console.log('STEP', 'newPage:done');
    page.on('crash', () => {
      console.log('STEP', 'page-crash');
    });
    page.on('console', (message) => {
      const text = message.text();
      if (text.includes('[wallet-ui]')) {
        console.log('BROWSER', text);
      }
    });

    console.log('STEP', 'resetWalletClientState:start');
    await resetWalletClientState(page);
    console.log('STEP', 'resetWalletClientState:done');
    console.log('STEP', 'mockAppApi:start');
    await mockAppApi(page, {
      session: { authenticated: false },
      tasks: [],
      agents: [],
      activity: [],
      transactions: [],
      walletStats,
    });
    console.log('STEP', 'mockAppApi:done');

    if (walletKind === 'phantom') {
      await walletMod.selectPhantomAccount(context, extensionId, 'Account 4');
    }

    console.log('STEP', 'goto:/app:start');
    await page.goto(`${baseURL}/app`, { waitUntil: 'domcontentloaded' });
    console.log('STEP', 'goto:/app:done');
    console.log('STEP', 'wallet-helper:start');
    await waitForWalletHelper(page);
    console.log('STEP', 'wallet-helper:done');
    await disconnectIfNeeded(page);
    console.log('WALLET_STATE_BEFORE', JSON.stringify(await readWalletState(page)));
    if (walletKind === 'metamask') {
      await walletMod.ensureMetaMaskUnlocked(context, extensionId);
    } else if (walletKind === 'phantom') {
      await walletMod.ensurePhantomUnlocked(context, extensionId);
    } else {
      await walletMod.ensureCoinbaseUnlocked(context, extensionId);
    }
    console.log('STEP', 'choose-wallet:start');
    await chooseWalletFromMenu(page, config.displayName);
    console.log('STEP', 'choose-wallet:done');

    await config.approveConnect(context, extensionId);

    if (walletKind === 'phantom' && await walletMod.recoverPhantomUnsupportedAccount(context, extensionId)) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await chooseWalletFromMenu(page, config.displayName);
      await config.approveConnect(context, extensionId);
    }

    const verifyResponse = page.waitForResponse((response) => {
      return response.url().includes('/api/auth/verify') && response.request().method() === 'POST';
    }, { timeout: 30_000 });

    await config.approveSignature(context, extensionId);

    const verify = await verifyResponse;
    console.log('VERIFY_STATUS', verify.status());

    const session = await waitUntil('authenticated session', async () => {
      const response = await page.evaluate(async () => {
        const result = await fetch('/api/auth/session');
        return result.json();
      });

      return response?.authenticated === true ? response : null;
    });

    console.log('AUTH_SESSION', JSON.stringify(session));

    await verifyWalletPage(page);
    console.log('WALLET_PAGE_OK');
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  const walletKind = process.argv[2]?.toLowerCase();
  const walletMod = await import('../e2e-wallet/support/synpressWallets') as WalletModule;
  const { mockAppApi } = await import('../e2e/support/mockApi');

  if (!walletKind || !isWalletKind(walletKind)) {
    throw new Error('Usage: npx tsx scripts/wallet-e2e-run.ts <metamask|phantom|coinbase>');
  }

  if (!mockAppApi) {
    throw new Error('Failed to load mockAppApi');
  }

  await runWalletFlow(walletKind, walletMod, mockAppApi);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
