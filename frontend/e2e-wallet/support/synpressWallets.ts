import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { prepareExtension, prepareExtensionPhantom } from '@synthetixio/synpress-cache';
import {
  MetaMask,
  getExtensionId,
  unlockForFixture,
} from '@synthetixio/synpress-metamask/playwright';
import {
  Phantom,
  getExtensionIdPhantom,
  unlockForFixturePhantom,
} from '@synthetixio/synpress-phantom/playwright';

const chromeUserDataRoot = path.join(
  os.homedir(),
  'Library/Application Support/Google/Chrome',
);
const chromeExecutablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cacheRoot = path.join(process.cwd(), '.cache-synpress', 'wallet-e2e');
const walletProfileVersion = 'v2';
const fixturePassword = 'Password123!';
const metaMaskExtensionPassword = process.env.PLAYWRIGHT_METAMASK_PASSWORD ?? null;
const phantomExtensionPassword =
  process.env.PLAYWRIGHT_PHANTOM_PASSWORD
  ?? process.env.PHANTOM_PASSWORD
  ?? null;
const requireChromeProfile = process.env.PLAYWRIGHT_WALLET_REQUIRE_CHROME_PROFILE === '1';
const seedPhrase = 'test test test test test test test test test test test junk';
const metaMaskHomeSelector = 'button[data-testid="app-header-logo"]';
const metaMaskChromeExtensionId = 'nkbihfbeogaeaoehlefnkodbefgpgknn';
const phantomChromeExtensionId = 'bfnaelmomeimhlpmgjnjophhpkkoljpa';
const chromeProfileCandidates = ['Default', 'Profile 2'];

type EthereumProvider = {
  request: (args: { method: string }) => Promise<unknown>;
};

type PageWalletKind = 'metamask' | 'phantom';

export interface WalletLaunch<TWallet> {
  context: BrowserContext;
  extensionId: string;
  wallet: TWallet;
}

type ChromeProfile = {
  name: string;
  score: number;
};

function walletArgs(extensionPath: string, loadExtension: boolean) {
  const args = [`--disable-extensions-except=${extensionPath}`];

  if (loadExtension) {
    args.push(`--load-extension=${extensionPath}`);
  }

  if (process.env.HEADLESS === 'true') {
    args.push('--headless=new');
  }

  return args;
}

async function hasCache(dir: string) {
  try {
    return (await fs.readdir(dir)).length > 0;
  } catch {
    return false;
  }
}

async function launchPersistentWalletContext(userDataDir: string, extensionPath: string, loadExtension: boolean) {
  return chromium.launchPersistentContext(userDataDir, {
    executablePath: chromeExecutablePath,
    headless: false,
    args: walletArgs(extensionPath, loadExtension),
  });
}

async function cloneProfile(profileDir: string) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elios-wallet-e2e-'));
  await fs.cp(profileDir, userDataDir, { recursive: true });
  return userDataDir;
}

async function cloneChromeProfile(profileName: string) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elios-wallet-profile-'));
  await fs.cp(path.join(chromeUserDataRoot, 'Local State'), path.join(userDataDir, 'Local State'));
  await fs.cp(path.join(chromeUserDataRoot, profileName), path.join(userDataDir, profileName), {
    recursive: true,
  });
  return userDataDir;
}

async function rmDir(dir: string) {
  await fs.rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 250,
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reservePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to reserve a local port'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

async function waitForChromeDebugger(port: number) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // Chrome has not exposed the debugger endpoint yet.
    }

    await delay(250);
  }

  throw new Error('Timed out waiting for Chrome remote debugging');
}

async function stopChromeProcess(process: ChildProcess) {
  if (process.exitCode !== null || process.killed) {
    return;
  }

  process.kill('SIGTERM');

  await Promise.race([
    new Promise((resolve) => process.once('exit', resolve)),
    delay(3_000),
  ]);

  if (process.exitCode !== null || process.killed) {
    return;
  }

  process.kill('SIGKILL');
  await Promise.race([
    new Promise((resolve) => process.once('exit', resolve)),
    delay(1_000),
  ]);
}

async function launchInstalledChromeProfileContext(profileName: string) {
  const userDataDir = await cloneChromeProfile(profileName);
  const port = await reservePort();
  const chromeProcess = spawn(
    chromeExecutablePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--profile-directory=${profileName}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    {
      stdio: 'ignore',
    },
  );

  try {
    await waitForChromeDebugger(port);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('Chrome CDP session did not expose a default browser context');
    }

    const close = async () => {
      await browser.close().catch(() => {});
      await stopChromeProcess(chromeProcess).catch(() => {});
      await rmDir(userDataDir).catch(() => {});
    };

    context.close = close;

    return context;
  } catch (error) {
    await stopChromeProcess(chromeProcess).catch(() => {});
    await rmDir(userDataDir).catch(() => {});
    throw error;
  }
}

function cleanupProfileOnClose(context: BrowserContext, userDataDir: string) {
  context.once('close', () => {
    void rmDir(userDataDir).catch(() => {});
  });
}

async function resolveLocalExtensionPath(extensionId: string) {
  const extensionDir = path.join(chromeUserDataRoot, 'Default', 'Extensions', extensionId);

  let versions;
  try {
    versions = await fs.readdir(extensionDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const latestVersion = versions
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
    .at(0);

  return latestVersion ? path.join(extensionDir, latestVersion) : null;
}

async function resolveProfileExtensionPath(profileName: string, extensionId: string) {
  const extensionDir = path.join(chromeUserDataRoot, profileName, 'Extensions', extensionId);

  let versions;
  try {
    versions = await fs.readdir(extensionDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const latestVersion = versions
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
    .at(0);

  return latestVersion ? path.join(extensionDir, latestVersion) : null;
}

async function statMtimeMs(filePath: string) {
  try {
    return (await fs.stat(filePath)).mtimeMs;
  } catch {
    return 0;
  }
}

async function findChromeProfiles(extensionIds: string[]) {
  const profiles = await Promise.all(
    chromeProfileCandidates.map(async (name): Promise<ChromeProfile | null> => {
      const scores = await Promise.all(extensionIds.map(async (extensionId) => {
        const extensionStatePath = path.join(
          chromeUserDataRoot,
          name,
          'Local Extension Settings',
          extensionId,
        );
        const extensionPath = await resolveProfileExtensionPath(name, extensionId);
        if (!extensionPath) {
          return 0;
        }

        return Math.max(
          await statMtimeMs(extensionStatePath),
          await statMtimeMs(extensionPath),
        );
      }));

      if (scores.some((score) => score === 0)) {
        return null;
      }

      return {
        name,
        score: Math.max(...scores),
      };
    }),
  );

  return profiles
    .filter((profile): profile is ChromeProfile => profile !== null)
    .sort((left, right) => right.score - left.score);
}

async function waitForExtensionPage(context: BrowserContext, extensionId: string) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const page = context.pages().find((entry) => entry.url().includes(`chrome-extension://${extensionId}`));
    if (page) {
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return page;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for extension page ${extensionId}`);
}

async function dismissIfVisible(locator: ReturnType<Page['locator']>) {
  if (await locator.count() === 0) {
    return;
  }

  if (!(await locator.first().isVisible().catch(() => false))) {
    return;
  }

  await locator.first().click({ force: true });
}

function splitSeedPhrase(seedPhraseValue: string) {
  const words = seedPhraseValue.trim().split(/\s+/);
  if (words.length !== 12) {
    throw new Error(`Expected a 12-word seed phrase, received ${words.length}`);
  }

  return words;
}

async function waitForMetaMaskHome(context: BrowserContext, extensionId: string) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    await unlockMetaMaskPages(context, extensionId);

    for (const page of context.pages()) {
      if (page.isClosed()) {
        continue;
      }

      if (!page.url().includes(`chrome-extension://${extensionId}`)) {
        continue;
      }

      const doneButton = page.getByTestId('onboarding-complete-done');
      if (await doneButton.count()) {
        if (await doneButton.first().isEnabled().catch(() => false)) {
          await doneButton.first().click().catch(() => {});
        }
      }

      if (
        page.url().includes(`chrome-extension://${extensionId}/home.html#/`)
        && !page.url().includes('/unlock')
      ) {
        return page;
      }

      const homeLogo = page.locator(metaMaskHomeSelector);
      if (await homeLogo.count().catch(() => 0)) {
        return page;
      }
    }

    await delay(500);
  }

  throw new Error('Timed out waiting for MetaMask home screen');
}

async function waitForMetaMaskUnlocked(page: Page) {
  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.isVisible().catch(() => false)) {
    if (!metaMaskExtensionPassword) {
      throw new Error('MetaMask is locked in the copied Chrome profile');
    }

    await passwordInput.fill(metaMaskExtensionPassword);
    await page.getByRole('button', { name: /^unlock$/i }).click();
  }
}

async function unlockMetaMaskPages(context: BrowserContext, extensionId: string) {
  if (!metaMaskExtensionPassword) {
    return false;
  }

  let unlocked = false;

  for (const page of context.pages()) {
    if (!page.url().includes(`chrome-extension://${extensionId}`) || !page.url().includes('/unlock')) {
      continue;
    }

    const passwordInput = page.locator('input[type="password"]');
    if (!(await passwordInput.isVisible().catch(() => false))) {
      continue;
    }

    await passwordInput.fill(metaMaskExtensionPassword);
    await page.getByRole('button', { name: /^unlock$/i }).click();
    unlocked = true;
  }

  if (unlocked) {
    await delay(1_500);
  }

  return unlocked;
}

async function waitForPhantomUnlocked(page: Page) {
  const passwordInput = page.locator('[data-testid="unlock-form-password-input"]');
  if (!(await passwordInput.isVisible().catch(() => false))) {
    return;
  }

  if (!phantomExtensionPassword) {
    throw new Error('Phantom is locked in the copied Chrome profile');
  }

  await passwordInput.fill(phantomExtensionPassword);
  await page.locator('[data-testid="unlock-form-submit-button"]').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="unlock-form-password-input"]'),
    undefined,
    { timeout: 30_000 },
  );
}

async function unlockPhantomPages(context: BrowserContext, extensionId: string) {
  if (!phantomExtensionPassword) {
    return false;
  }

  let unlocked = false;

  for (const page of context.pages()) {
    if (!page.url().includes(`chrome-extension://${extensionId}`)) {
      continue;
    }

    const passwordInput = page.locator('[data-testid="unlock-form-password-input"]');
    if (!(await passwordInput.isVisible().catch(() => false))) {
      continue;
    }

    await passwordInput.fill(phantomExtensionPassword);
    await page.locator('[data-testid="unlock-form-submit-button"]').click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="unlock-form-password-input"]'),
      undefined,
      { timeout: 30_000 },
    );
    unlocked = true;
  }

  if (unlocked) {
    await delay(1_500);
  }

  return unlocked;
}

function resolveKnownExtensionId(extensionPath: string, extensionId: string) {
  return extensionPath.includes(`${path.sep}Extensions${path.sep}${extensionId}${path.sep}`)
    ? extensionId
    : null;
}

function findMetaMaskNotificationPage(context: BrowserContext, extensionId: string) {
  const prefix = `chrome-extension://${extensionId}/notification.html`;
  return context.pages().find((entry) => entry.url().startsWith(prefix));
}

function findPhantomNotificationPage(context: BrowserContext, extensionId: string) {
  const prefix = `chrome-extension://${extensionId}/notification.html`;
  return context.pages().find((entry) => entry.url().startsWith(prefix));
}

function findPhantomPopupPage(context: BrowserContext, extensionId: string) {
  const prefix = `chrome-extension://${extensionId}/popup.html`;
  return context.pages().find((entry) => entry.url().startsWith(prefix));
}

async function clickMetaMaskButton(page: Page, names: string[]) {
  for (const name of names) {
    const buttons = page.getByRole('button', { name });
    const count = await buttons.count().catch(() => 0);

    for (let index = 0; index < count; index++) {
      const button = buttons.nth(index);
      const visible = await button.isVisible().catch(() => false);
      const enabled = await button.isEnabled().catch(() => false);
      if (!visible || !enabled) {
        continue;
      }

      await button.click();
      return true;
    }
  }

  return false;
}

async function clickPhantomButton(page: Page, names: string[]) {
  for (const name of names) {
    const buttons = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') });
    const count = await buttons.count().catch(() => 0);

    for (let index = 0; index < count; index++) {
      const button = buttons.nth(index);
      const visible = await button.isVisible().catch(() => false);
      const enabled = await button.isEnabled().catch(() => false);
      if (!visible || !enabled) {
        continue;
      }

      await button.click();
      return true;
    }
  }

  return false;
}

export async function approveMetaMaskConnect(context: BrowserContext, extensionId: string) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    await unlockMetaMaskPages(context, extensionId);
    await clickWalletExtensionChoice(context, 'MetaMask');

    const page = findMetaMaskNotificationPage(context, extensionId);
    if (!page) {
      await delay(250);
      continue;
    }

    await page.waitForLoadState('domcontentloaded').catch(() => {});

    if (page.isClosed()) {
      return;
    }

    if (page.url().includes('/signature-request')) {
      return;
    }

    if (!page.url().includes('/connect/')) {
      await delay(250);
      continue;
    }

    if (await clickMetaMaskButton(page, ['Next', 'Connect'])) {
      await delay(1_000);
      continue;
    }

    await delay(500);
  }
}

export async function approveMetaMaskSignature(context: BrowserContext, extensionId: string) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    await unlockMetaMaskPages(context, extensionId);
    await clickWalletExtensionChoice(context, 'MetaMask');

    const page = findMetaMaskNotificationPage(context, extensionId);
    if (!page) {
      await delay(250);
      continue;
    }

    await page.waitForLoadState('domcontentloaded').catch(() => {});

    if (page.isClosed()) {
      return;
    }

    if (page.url().includes('/connect/')) {
      await delay(250);
      continue;
    }

    if (await clickMetaMaskButton(page, ['Sign', 'Confirm', 'Approve'])) {
      await delay(1_000);
      continue;
    }

    await delay(500);
  }
}

export async function approvePhantomConnect(context: BrowserContext, extensionId: string) {
  const deadline = Date.now() + 30_000;
  let clickedConnect = false;

  while (Date.now() < deadline) {
    await clickWalletExtensionChoice(context, 'Phantom');
    await unlockPhantomPages(context, extensionId);

    const page = findPhantomNotificationPage(context, extensionId);
    if (!page) {
      if (clickedConnect) {
        return;
      }

      await delay(250);
      continue;
    }

    await page.waitForLoadState('domcontentloaded').catch(() => {});

    if (page.isClosed()) {
      if (clickedConnect) {
        return;
      }

      await delay(250);
      continue;
    }

    if (await clickPhantomButton(page, ['Connect', 'Continue'])) {
      clickedConnect = true;
      await delay(1_000);
      continue;
    }

    if (clickedConnect && await clickPhantomButton(page, ['Confirm'])) {
      return;
    }

    if (clickedConnect) {
      const connectButton = page.getByRole('button', { name: /^connect$/i });
      if (!(await connectButton.isVisible().catch(() => false))) {
        return;
      }
    }

    await delay(500);
  }
}

export async function approvePhantomSignature(context: BrowserContext, extensionId: string) {
  const deadline = Date.now() + 30_000;
  let clickedConfirm = false;

  while (Date.now() < deadline) {
    await clickWalletExtensionChoice(context, 'Phantom');
    await unlockPhantomPages(context, extensionId);

    const page = findPhantomNotificationPage(context, extensionId);
    if (!page) {
      if (clickedConfirm) {
        return;
      }

      await delay(250);
      continue;
    }

    await page.waitForLoadState('domcontentloaded').catch(() => {});

    if (page.isClosed()) {
      if (clickedConfirm) {
        return;
      }

      await delay(250);
      continue;
    }

    if (await clickPhantomButton(page, ['Connect', 'Continue', 'Confirm', 'Sign', 'Approve'])) {
      clickedConfirm = true;
      await delay(1_000);
      continue;
    }

    if (clickedConfirm) {
      return;
    }

    await delay(500);
  }
}

export async function recoverPhantomUnsupportedAccount(context: BrowserContext, extensionId: string) {
  const notification = findPhantomNotificationPage(context, extensionId);
  if (!notification) {
    return false;
  }

  await notification.waitForLoadState('domcontentloaded').catch(() => {});
  await unlockPhantomPages(context, extensionId);
  await notification.waitForLoadState('domcontentloaded').catch(() => {});
  const notificationBody = await notification.locator('body').innerText().catch(() => '');
  if (!notificationBody.includes('Unsupported account')) {
    return false;
  }

  let popup = findPhantomPopupPage(context, extensionId);
  if (!popup) {
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  }

  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  await waitForPhantomUnlocked(popup);
  await popup.getByTestId('settings-menu-open-button').click();
  await popup.waitForTimeout(1_000);

  const accountButtons = popup.getByRole('button', { name: /Account \d+/i });
  const count = await accountButtons.count().catch(() => 0);

  for (let index = count - 1; index >= 0; index--) {
    await accountButtons.nth(index).click().catch(() => {});
    await popup.waitForTimeout(1_500);

    const popupBody = await popup.locator('body').innerText().catch(() => '');
    if (popupBody.includes('Ethereum') && popupBody.includes('ETH')) {
      break;
    }
  }

  await notification.getByRole('button', { name: /^close$/i }).click().catch(() => {});
  await delay(500);

  return true;
}

async function clickWalletExtensionChoice(
  context: BrowserContext,
  walletName: 'MetaMask' | 'Phantom',
) {
  const page = context.pages().find((entry) => entry.url() === `chrome-extension://${phantomChromeExtensionId}/notification.html`);
  if (!page) {
    return false;
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});

  if (page.isClosed()) {
    return false;
  }

  const chooserHeading = page.getByText('Which extension do you want to connect with?');
  if (!(await chooserHeading.isVisible().catch(() => false))) {
    return false;
  }

  const button = page.getByRole('button', { name: `Use ${walletName}` });
  if (!(await button.isVisible().catch(() => false))) {
    return false;
  }

  await button.click();
  return true;
}

export async function chooseWalletExtension(context: BrowserContext, walletName: 'MetaMask' | 'Phantom') {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (walletName === 'MetaMask' && findMetaMaskNotificationPage(context, metaMaskChromeExtensionId)) {
      return;
    }

    if (await clickWalletExtensionChoice(context, walletName)) {
      return;
    }

    if (walletName === 'Phantom' && findPhantomNotificationPage(context, phantomChromeExtensionId)) {
      return;
    }

    await delay(250);
  }
}

async function closeMetaMaskSetupPages(context: BrowserContext, extensionId: string, homePage: Page) {
  for (const page of context.pages()) {
    if (page === homePage || page.isClosed()) {
      continue;
    }

    if (!page.url().includes(`chrome-extension://${extensionId}`)) {
      continue;
    }

    const isSetupPage =
      await page.getByRole('button', { name: 'Create a new wallet' }).isVisible().catch(() => false)
      || await page.getByRole('button', { name: 'I have an existing wallet' }).isVisible().catch(() => false)
      || await page.getByTestId('onboarding-complete-done').isVisible().catch(() => false);

    if (!isSetupPage) {
      continue;
    }

    await page.close().catch(() => {});
  }
}

async function importMetaMaskWallet(page: Page) {
  const words = splitSeedPhrase(seedPhrase);

  await page.getByTestId('onboarding-import-wallet').click();
  await page.getByTestId('onboarding-import-with-srp-button').click();

  const noteField = page.getByTestId('srp-input-import__srp-note');
  if (await noteField.isVisible().catch(() => false)) {
    await noteField.fill(words.join(' '));
  } else {
    for (const [index, word] of words.entries()) {
      const input = page.getByTestId(`import-srp__srp-word-${index}`);
      await expect(input).toBeVisible({ timeout: 30_000 });
      await input.fill(word);
    }
  }

  const confirmButton = page.getByTestId('import-srp-confirm');
  await expect(confirmButton).toBeEnabled({ timeout: 30_000 });
  await confirmButton.click();

  const passwordInput = page.getByTestId('create-password-new-input');
  await expect(passwordInput).toBeVisible({ timeout: 30_000 });
  await passwordInput.fill(fixturePassword);
  await page.getByTestId('create-password-confirm-input').fill(fixturePassword);
  await page.getByTestId('create-password-terms').click();
  await page.getByTestId('create-password-submit').click();

  const metricsOptOut = page.locator('#metametrics-opt-in');
  if (await metricsOptOut.isVisible().catch(() => false)) {
    await metricsOptOut.click();
  }

  await page.getByTestId('metametrics-i-agree').click();
}

async function settleMetaMaskSetup(context: BrowserContext, extensionId: string, page: Page) {
  const doneButton = page.getByTestId('onboarding-complete-done');

  if (await doneButton.count()) {
    await expect(doneButton).toBeEnabled({ timeout: 30_000 });
    await doneButton.click();
  }

  const homePage = await waitForMetaMaskHome(context, extensionId);

  await homePage.waitForLoadState('domcontentloaded').catch(() => {});
  await dismissIfVisible(homePage.getByTestId('popover-close'));
  await dismissIfVisible(homePage.locator('.new-network-info__wrapper button.btn-primary'));
  await dismissIfVisible(homePage.locator('.recovery-phrase-reminder button.btn-primary'));
  await closeMetaMaskSetupPages(context, extensionId, homePage);
}

async function launchMetaMaskFromChromeProfile(): Promise<WalletLaunch<MetaMask> | null> {
  const profiles = await findChromeProfiles([metaMaskChromeExtensionId]);
  if (profiles.length === 0) {
    return null;
  }

  const errors: string[] = [];

  for (const profile of profiles) {
    const extensionPath = await resolveProfileExtensionPath(profile.name, metaMaskChromeExtensionId);
    if (!extensionPath) {
      continue;
    }

    const context = await launchInstalledChromeProfileContext(profile.name);

    try {
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(`chrome-extension://${metaMaskChromeExtensionId}/home.html#/`, { waitUntil: 'domcontentloaded' });
      await unlockMetaMaskPages(context, metaMaskChromeExtensionId);
      await waitForMetaMaskUnlocked(page);
      const homePage = await waitForMetaMaskHome(context, metaMaskChromeExtensionId);
      await closeMetaMaskSetupPages(context, metaMaskChromeExtensionId, homePage);

      return {
        context,
        extensionId: metaMaskChromeExtensionId,
        wallet: new MetaMask(context, homePage, '', metaMaskChromeExtensionId),
      };
    } catch (error) {
      errors.push(`${profile.name}: ${error instanceof Error ? error.message : String(error)}`);
      await context.close().catch(() => {});
    }
  }

  if (requireChromeProfile && errors.length > 0) {
    throw new Error(`Failed to launch MetaMask from a copied Chrome profile: ${errors.join(' | ')}`);
  }

  return null;
}

async function launchPhantomFromChromeProfile(): Promise<WalletLaunch<Phantom> | null> {
  const profiles = await findChromeProfiles([phantomChromeExtensionId]);
  if (profiles.length === 0) {
    return null;
  }

  const errors: string[] = [];

  for (const profile of profiles) {
    const extensionPath = await resolveProfileExtensionPath(profile.name, phantomChromeExtensionId);
    if (!extensionPath) {
      continue;
    }

    const context = await launchInstalledChromeProfileContext(profile.name);

    try {
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(`chrome-extension://${phantomChromeExtensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
      await waitForPhantomUnlocked(page);

      return {
        context,
        extensionId: phantomChromeExtensionId,
        wallet: new Phantom(context, page, '', phantomChromeExtensionId),
      };
    } catch (error) {
      errors.push(`${profile.name}: ${error instanceof Error ? error.message : String(error)}`);
      await context.close().catch(() => {});
    }
  }

  if (requireChromeProfile && errors.length > 0) {
    throw new Error(`Failed to launch Phantom from a copied Chrome profile: ${errors.join(' | ')}`);
  }

  return null;
}

async function ensureMetaMaskProfile(extensionPath: string) {
  const profileDir = path.join(cacheRoot, `${walletProfileVersion}-metamask-${path.basename(extensionPath)}`);
  if (await hasCache(profileDir)) {
    return profileDir;
  }

  await rmDir(profileDir);

  const context = await launchPersistentWalletContext(profileDir, extensionPath, true);

  try {
    const extensionId = resolveKnownExtensionId(extensionPath, metaMaskChromeExtensionId)
      ?? await getExtensionId(context, 'MetaMask');
    const page = await context.newPage();

    await page.goto(`chrome-extension://${extensionId}/home.html#/`, { waitUntil: 'domcontentloaded' });
    await importMetaMaskWallet(page);
    await settleMetaMaskSetup(context, extensionId, page);
    await page.waitForTimeout(2_000);
  } catch (error) {
    await context.close().catch(() => {});
    await rmDir(profileDir);
    throw error;
  }

  await context.close();
  return profileDir;
}

async function ensurePhantomProfile(extensionPath: string) {
  const profileDir = path.join(cacheRoot, `${walletProfileVersion}-phantom-${path.basename(extensionPath)}`);
  if (await hasCache(profileDir)) {
    return profileDir;
  }

  await fs.rm(profileDir, { recursive: true, force: true });

  const context = await launchPersistentWalletContext(profileDir, extensionPath, true);

  try {
    const extensionId = resolveKnownExtensionId(extensionPath, phantomChromeExtensionId)
      ?? await getExtensionIdPhantom(context, 'Phantom');
    const page = await waitForExtensionPage(context, extensionId);
    const wallet = new Phantom(context, page, fixturePassword, extensionId);

    await wallet.importWallet(seedPhrase);
    await page.waitForTimeout(1_000);
  } catch (error) {
    await context.close().catch(() => {});
    await fs.rm(profileDir, { recursive: true, force: true });
    throw error;
  }

  await context.close();
  return profileDir;
}

export async function launchMetaMask(): Promise<WalletLaunch<MetaMask>> {
  try {
    const chromeProfileLaunch = await launchMetaMaskFromChromeProfile();
    if (chromeProfileLaunch) {
      return chromeProfileLaunch;
    }
  } catch (error) {
    if (requireChromeProfile) {
      throw error;
    }

    // Fall through to a deterministic seeded wallet when the copied personal profile is unavailable or unstable.
  }

  const extensionPath = process.env.PLAYWRIGHT_METAMASK_EXTENSION_PATH
    ?? await resolveLocalExtensionPath(metaMaskChromeExtensionId)
    ?? await prepareExtension();
  const profileDir = await ensureMetaMaskProfile(extensionPath);
  const userDataDir = await cloneProfile(profileDir);
  const context = await launchPersistentWalletContext(userDataDir, extensionPath, false);
  cleanupProfileOnClose(context, userDataDir);

  const extensionId = resolveKnownExtensionId(extensionPath, metaMaskChromeExtensionId)
    ?? await getExtensionId(context, 'MetaMask');
  const page = context.pages()[0] ?? await context.newPage();

  await page.goto(`chrome-extension://${extensionId}/home.html#/`, { waitUntil: 'domcontentloaded' });
  await unlockForFixture(page, fixturePassword);
  const homePage = await waitForMetaMaskHome(context, extensionId);
  await closeMetaMaskSetupPages(context, extensionId, homePage);

  const wallet = new MetaMask(context, homePage, fixturePassword, extensionId);

  return { context, extensionId, wallet };
}

export async function launchPhantom(): Promise<WalletLaunch<Phantom>> {
  try {
    const chromeProfileLaunch = await launchPhantomFromChromeProfile();
    if (chromeProfileLaunch) {
      return chromeProfileLaunch;
    }
  } catch (error) {
    if (requireChromeProfile) {
      throw error;
    }
  }

  const extensionPath = process.env.PLAYWRIGHT_PHANTOM_EXTENSION_PATH
    ?? await resolveLocalExtensionPath(phantomChromeExtensionId)
    ?? await prepareExtensionPhantom();
  const profileDir = await ensurePhantomProfile(extensionPath);
  const userDataDir = await cloneProfile(profileDir);
  const context = await launchPersistentWalletContext(userDataDir, extensionPath, false);
  cleanupProfileOnClose(context, userDataDir);

  const extensionId = resolveKnownExtensionId(extensionPath, phantomChromeExtensionId)
    ?? await getExtensionIdPhantom(context, 'Phantom');
  const page = await context.newPage();

  await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await unlockForFixturePhantom(page, fixturePassword);

  const wallet = new Phantom(context, page, fixturePassword, extensionId);

  return { context, extensionId, wallet };
}

export async function readInjectedAccount(page: Page, walletKind: PageWalletKind) {
  return page.evaluate(async (kind) => {
    const browserWindow = window as Window & {
      ethereum?: EthereumProvider;
      phantom?: {
        ethereum?: EthereumProvider;
      };
    };

    const provider = kind === 'phantom'
      ? browserWindow.phantom?.ethereum ?? browserWindow.ethereum
      : browserWindow.ethereum;
    if (!provider) return null;

    const accounts = await provider.request({ method: 'eth_accounts' });
    return Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null;
  }, walletKind);
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function expectWalletConnected(page: Page, walletKind: PageWalletKind) {
  await expect
    .poll(() => readInjectedAccount(page, walletKind), { timeout: 30_000 })
    .toMatch(/^0x[a-fA-F0-9]{40}$/);

  return readInjectedAccount(page, walletKind) as Promise<string>;
}
