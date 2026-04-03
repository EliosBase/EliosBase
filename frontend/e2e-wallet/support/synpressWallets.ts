import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
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
const execFileAsync = promisify(execFile);
const walletDebugEnabled = process.env.PLAYWRIGHT_WALLET_DEBUG === '1';
const metaMaskExtensionPassword = process.env.PLAYWRIGHT_METAMASK_PASSWORD ?? null;
const phantomExtensionPassword =
  process.env.PLAYWRIGHT_PHANTOM_PASSWORD
  ?? process.env.PHANTOM_PASSWORD
  ?? null;
const coinbaseExtensionPassword =
  process.env.PLAYWRIGHT_COINBASE_PASSWORD
  ?? process.env.COINBASE_PASSWORD
  ?? null;
const requireChromeProfile = process.env.PLAYWRIGHT_WALLET_REQUIRE_CHROME_PROFILE === '1';
const seedPhrase = 'test test test test test test test test test test test junk';
const metaMaskHomeSelector = 'button[data-testid="app-header-logo"]';
const metaMaskChromeExtensionId = 'nkbihfbeogaeaoehlefnkodbefgpgknn';
const phantomChromeExtensionId = 'bfnaelmomeimhlpmgjnjophhpkkoljpa';
const coinbaseChromeExtensionId = 'hnfanknocfeofbddgcijnmhnfnkdnaad';
const chromeProfileCandidates = ['Default', 'Profile 2'];
const copiedChromeExtensionIds = [
  metaMaskChromeExtensionId,
  phantomChromeExtensionId,
  coinbaseChromeExtensionId,
];

type EthereumProvider = {
  request: (args: { method: string }) => Promise<unknown>;
};

type PageWalletKind = 'coinbase' | 'metamask' | 'phantom';

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
  await assertChromeClosed();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elios-wallet-profile-'));
  await execFileAsync('rsync', [
    '-a',
    '--exclude=Singleton*',
    '--exclude=lockfile',
    '--exclude=LOCK',
    '--exclude=*.tmp',
    path.join(chromeUserDataRoot, 'Local State'),
    path.join(userDataDir, 'Local State'),
  ]);
  await execFileAsync('rsync', [
    '-a',
    '--exclude=Extensions',
    '--exclude=Singleton*',
    '--exclude=lockfile',
    '--exclude=LOCK',
    '--exclude=*.tmp',
    `${path.join(chromeUserDataRoot, profileName)}/`,
    `${path.join(userDataDir, profileName)}/`,
  ]);

  for (const extensionId of copiedChromeExtensionIds) {
    const sourceDir = path.join(chromeUserDataRoot, profileName, 'Extensions', extensionId);
    const destDir = path.join(userDataDir, profileName, 'Extensions', extensionId);

    try {
      await fs.access(sourceDir);
    } catch {
      continue;
    }

    await execFileAsync('mkdir', ['-p', destDir]);
    await execFileAsync('rsync', ['-a', `${sourceDir}/`, `${destDir}/`]);
  }

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

function walletDebug(...args: unknown[]) {
  if (walletDebugEnabled) {
    console.log('[wallet-e2e]', ...args);
  }
}

function isClosedTargetError(error: unknown) {
  return error instanceof Error
    && /Target page, context or browser has been closed|Execution context was destroyed|Target closed/i.test(
      error.message,
    );
}

function isSandboxChromeCommand(command: string) {
  return command.includes('--user-data-dir=')
    && (command.includes('elios-wallet-profile-') || command.includes('elios-wallet-e2e-'));
}

async function listGoogleChromeCommands() {
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'command=']);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line === chromeExecutablePath || line.startsWith(`${chromeExecutablePath} `));
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 1
    ) {
      return [] as string[];
    }

    throw error;
  }
}

async function isGoogleChromeRunning() {
  const commands = await listGoogleChromeCommands();
  return commands.some((command) => !isSandboxChromeCommand(command));
}

async function assertChromeClosed() {
  if (!(await isGoogleChromeRunning())) {
    return;
  }

  throw new Error(
    'Close Google Chrome before wallet E2E copies a profile. The harness only runs against a cold copied profile.',
  );
}

async function visibleButtonLabels(page: Page) {
  const labels = await page.getByRole('button').evaluateAll((nodes) => nodes
    .map((node) => (node.textContent ?? '').trim())
    .filter(Boolean))
    .catch(() => [] as string[]);

  return labels.slice(0, 20);
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
  // Real-wallet tests attach to a throwaway copy of a local Chrome profile, never the live profile.
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

      if (
        page.url().includes(`chrome-extension://${extensionId}/home.html#/`)
        && !page.url().includes('/unlock')
      ) {
        return page;
      }

      const doneButton = page.getByTestId('onboarding-complete-done');
      if (await doneButton.count()) {
        if (await doneButton.first().isEnabled().catch(() => false)) {
          await doneButton.first().click().catch(() => {});
        }
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

export async function ensureMetaMaskUnlocked(context: BrowserContext, extensionId: string) {
  await unlockMetaMaskPages(context, extensionId);
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

export async function ensurePhantomUnlocked(context: BrowserContext, extensionId: string) {
  await unlockPhantomPages(context, extensionId);
}

async function unlockCoinbasePages(context: BrowserContext, extensionId: string) {
  if (!coinbaseExtensionPassword) {
    return false;
  }

  let unlocked = false;
  walletDebug('coinbase unlock pages', context.pages().map((page) => page.url()));

  for (const page of context.pages()) {
    if (!page.url().includes(`chrome-extension://${extensionId}`)) {
      continue;
    }

    if (await unlockCoinbasePage(page)) {
      unlocked = true;
    }
  }

  if (unlocked) {
    await delay(1_500);
  }

  return unlocked;
}

export async function ensureCoinbaseUnlocked(context: BrowserContext, extensionId: string) {
  await unlockCoinbasePages(context, extensionId);
}

async function hasVisiblePasswordInput(page: Page) {
  const passwordInputs = page.locator('input[type="password"]');
  const count = await passwordInputs.count().catch(() => 0);

  for (let index = 0; index < count; index++) {
    if (await passwordInputs.nth(index).isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function unlockCoinbasePage(page: Page) {
  if (!coinbaseExtensionPassword) {
    return false;
  }

  if (!(await hasVisiblePasswordInput(page))) {
    return false;
  }

  walletDebug(
    'coinbase unlock prompt',
    page.url(),
    await visibleButtonLabels(page),
    await page.locator('body').innerText().then((text) => text.slice(0, 400)).catch(() => ''),
  );

  for (let attempt = 0; attempt < 3; attempt++) {
    const passwordInputs = page.locator('input[type="password"]');
    const passwordInputCount = await passwordInputs.count().catch(() => 0);

    for (let index = 0; index < passwordInputCount; index++) {
      const input = passwordInputs.nth(index);
      if (!(await input.isVisible().catch(() => false))) {
        continue;
      }

      await input.fill(coinbaseExtensionPassword);
    }

    const unlockButtons = [
      page.getByRole('button', { name: /^unlock$/i }),
      page.getByRole('button', { name: /continue|sign in/i }),
    ];

    let clicked = false;

    for (const locator of unlockButtons) {
      const count = await locator.count().catch(() => 0);
      for (let index = count - 1; index >= 0; index--) {
        const button = locator.nth(index);
        if (!(await button.isVisible().catch(() => false))) {
          continue;
        }

        await button.click({ force: true });
        clicked = true;
        break;
      }

      if (clicked) {
        break;
      }
    }

    if (!clicked) {
      return false;
    }

    await delay(750);

    if (!(await hasVisiblePasswordInput(page))) {
      return true;
    }
  }

  return false;
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

function findCoinbaseExtensionPage(context: BrowserContext, extensionId: string) {
  const prefix = `chrome-extension://${extensionId}/`;
  const pages = context.pages().filter((entry) => entry.url().startsWith(prefix));
  const priority = [
    /inPageRequest=true/i,
    /action=request|requestEthereumAccounts|type=extensionUIRequest|approval|sign|connect|popup/i,
    /notification/i,
    /index\.html/i,
  ];

  for (const pattern of priority) {
    const page = pages.find((entry) => pattern.test(entry.url()));
    if (page) {
      return page;
    }
  }

  return pages[0];
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

async function clickCoinbaseButton(page: Page, names: string[]) {
  for (const name of names) {
    const buttons = page.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}$`, 'i') });
    const count = await buttons.count().catch(() => 0);

    for (let index = 0; index < count; index++) {
      const button = buttons.nth(index);
      const visible = await button.isVisible().catch(() => false);
      const enabled = await button.isEnabled().catch(() => false);
      if (!visible || !enabled) {
        continue;
      }

      try {
        await button.click({ noWaitAfter: true, timeout: 1_000 });
        return true;
      } catch (error) {
        if (isClosedTargetError(error) || page.isClosed()) {
          return true;
        }

        try {
          await button.evaluate((node: HTMLButtonElement) => {
            node.click();
          });
          return true;
        } catch (evaluateError) {
          if (isClosedTargetError(evaluateError) || page.isClosed()) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

export async function approveMetaMaskConnect(context: BrowserContext, extensionId: string) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    await unlockMetaMaskPages(context, extensionId);
    await clickWalletExtensionChoice(context, 'MetaMask');
    walletDebug('metamask connect pages', context.pages().map((page) => page.url()));

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
    walletDebug('metamask signature pages', context.pages().map((page) => page.url()));

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

    walletDebug(
      'metamask signature page',
      page.url(),
      await visibleButtonLabels(page),
      await page.locator('body').innerText().then((text) => text.slice(0, 500)).catch(() => ''),
    );

    if (await clickMetaMaskButton(page, ['Sign', 'Confirm', 'Approve'])) {
      walletDebug('metamask signature clicked');
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
    walletDebug('phantom connect pages', context.pages().map((page) => page.url()));

    const page = findPhantomNotificationPage(context, extensionId)
      ?? findPhantomPopupPage(context, extensionId);
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
    walletDebug('phantom signature pages', context.pages().map((page) => page.url()));

    const page = findPhantomNotificationPage(context, extensionId)
      ?? findPhantomPopupPage(context, extensionId);
    if (!page) {
      if (clickedConfirm) {
        return;
      }

      await delay(250);
      continue;
    }

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    walletDebug(
      'phantom signature page details',
      page.url(),
      await visibleButtonLabels(page),
      await page.locator('body').innerText().then((text) => text.slice(0, 600)).catch(() => ''),
    );

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

export async function approveCoinbaseConnect(context: BrowserContext, extensionId: string) {
  const deadline = Date.now() + 30_000;
  let clickedConfirm = false;

  while (Date.now() < deadline) {
    walletDebug('coinbase connect pages', context.pages().map((page) => page.url()));
    await unlockCoinbasePages(context, extensionId);

    const page = findCoinbaseExtensionPage(context, extensionId);
    if (!page) {
      if (clickedConfirm) {
        return;
      }

      await delay(250);
      continue;
    }

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    if (await unlockCoinbasePage(page)) {
      await delay(750);
      continue;
    }

    if (await hasVisiblePasswordInput(page)) {
      await delay(500);
      continue;
    }
    walletDebug(
      '[wallet-e2e] coinbase connect page',
      page.url(),
      await visibleButtonLabels(page),
      await page.locator('body').innerText().then((text) => text.slice(0, 500)).catch(() => ''),
    );

    if (page.isClosed()) {
      if (clickedConfirm) {
        return;
      }

      await delay(250);
      continue;
    }

    if (await clickCoinbaseButton(page, ['Connect', 'Continue', 'Next', 'Confirm', 'Approve'])) {
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

export async function approveCoinbaseSignature(context: BrowserContext, extensionId: string) {
  const deadline = Date.now() + 30_000;
  let clickedConfirm = false;

  while (Date.now() < deadline) {
    walletDebug('coinbase signature pages', context.pages().map((page) => page.url()));
    await unlockCoinbasePages(context, extensionId);

    const page = findCoinbaseExtensionPage(context, extensionId);
    if (!page) {
      if (clickedConfirm) {
        return;
      }

      await delay(250);
      continue;
    }

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    if (await unlockCoinbasePage(page)) {
      await delay(750);
      continue;
    }

    if (await hasVisiblePasswordInput(page)) {
      await delay(500);
      continue;
    }
    walletDebug(
      '[wallet-e2e] coinbase signature page',
      page.url(),
      await visibleButtonLabels(page),
      await page.locator('body').innerText().then((text) => text.slice(0, 500)).catch(() => ''),
    );

    if (page.isClosed()) {
      if (clickedConfirm) {
        return;
      }

      await delay(250);
      continue;
    }

    if (await clickCoinbaseButton(page, ['Connect', 'Continue', 'Next', 'Approve', 'Confirm', 'Sign'])) {
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

export async function selectPhantomAccount(context: BrowserContext, extensionId: string, accountName: string) {
  let popup = findPhantomPopupPage(context, extensionId);
  if (!popup) {
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  }

  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  await waitForPhantomUnlocked(popup);
  walletDebug('phantom popup before account select', popup.url());
  const settingsButton = popup.getByTestId('settings-menu-open-button');
  if (!(await settingsButton.isVisible().catch(() => false))) {
    return false;
  }

  await settingsButton.click({ timeout: 5_000 }).catch(() => null);
  await popup.waitForTimeout(1_000);

  const target = popup.getByRole('button', { name: new RegExp(`^${accountName}$`, 'i') }).first();
  if (!(await target.isVisible().catch(() => false))) {
    return false;
  }

  await target.click({ timeout: 5_000 }).catch(() => null);
  await popup.waitForTimeout(1_500);
  walletDebug('phantom selected account', accountName, await popup.locator('body').innerText().catch(() => ''));
  return true;
}

async function clickWalletExtensionChoice(
  context: BrowserContext,
  walletName: 'MetaMask' | 'Phantom',
) {
  const phantomChooserPage = context.pages().find((entry) => {
    return entry.url() === `chrome-extension://${phantomChromeExtensionId}/notification.html`;
  });

  if (phantomChooserPage) {
    await phantomChooserPage.waitForLoadState('domcontentloaded').catch(() => {});

    if (!phantomChooserPage.isClosed()) {
      const chooserHeading = phantomChooserPage.getByText('Which extension do you want to connect with?');
      if (await chooserHeading.isVisible().catch(() => false)) {
        const button = phantomChooserPage.getByRole('button', { name: `Use ${walletName}` });
        if (await button.isVisible().catch(() => false)) {
          await button.click();
          return true;
        }
      }
    }
  }

  const coinbaseChooserPage = context.pages().find((entry) => {
    return entry.url().startsWith(`chrome-extension://${coinbaseChromeExtensionId}/`)
      && entry.url().includes('action=selectProvider');
  });

  if (!coinbaseChooserPage) {
    return false;
  }

  await coinbaseChooserPage.waitForLoadState('domcontentloaded').catch(() => {});

  if (coinbaseChooserPage.isClosed()) {
    return false;
  }

  walletDebug(
    'coinbase chooser',
    walletName,
    coinbaseChooserPage.url(),
    await visibleButtonLabels(coinbaseChooserPage),
    await coinbaseChooserPage.locator('body').innerText().then((text) => text.slice(0, 400)).catch(() => ''),
  );

  const buttonNames = [
    walletName,
    `Use ${walletName}`,
    `Continue with ${walletName}`,
    `Continue in ${walletName}`,
  ];

  for (const name of buttonNames) {
    const button = coinbaseChooserPage.getByRole('button', { name: new RegExp(name, 'i') }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return true;
    }
  }

  const textTarget = coinbaseChooserPage.getByText(new RegExp(walletName, 'i')).first();
  if (await textTarget.isVisible().catch(() => false)) {
    await textTarget.click();
    return true;
  }

  return false;
}

export async function chooseWalletExtension(context: BrowserContext, walletName: 'MetaMask' | 'Phantom') {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    walletDebug('choose wallet pages', walletName, context.pages().map((page) => page.url()));

    if (walletName === 'MetaMask' && findMetaMaskNotificationPage(context, metaMaskChromeExtensionId)) {
      walletDebug('choose wallet found metamask notification');
      return;
    }

    if (await clickWalletExtensionChoice(context, walletName)) {
      walletDebug('choose wallet clicked chooser', walletName);
      return;
    }

    if (walletName === 'Phantom' && findPhantomNotificationPage(context, phantomChromeExtensionId)) {
      walletDebug('choose wallet found phantom notification');
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
  walletDebug('metamask profiles', profiles);
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
      walletDebug('launch metamask profile', profile.name);
      const page = context.pages()[0] ?? await context.newPage();
      walletDebug('metamask goto home start');
      await page.goto(`chrome-extension://${metaMaskChromeExtensionId}/home.html#/`, { waitUntil: 'domcontentloaded' });
      walletDebug('metamask goto home done', page.url());
      walletDebug('metamask unlock pages start');
      await unlockMetaMaskPages(context, metaMaskChromeExtensionId);
      walletDebug('metamask unlock pages done');
      walletDebug('metamask unlock current page start');
      await waitForMetaMaskUnlocked(page);
      walletDebug('metamask unlock current page done');
      walletDebug('metamask wait for home start');
      const homePage = await waitForMetaMaskHome(context, metaMaskChromeExtensionId);
      walletDebug('metamask home page', homePage.url());
      walletDebug('metamask close setup start');
      await closeMetaMaskSetupPages(context, metaMaskChromeExtensionId, homePage);
      walletDebug('metamask close setup done');

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
  walletDebug('phantom profiles', profiles);
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
      walletDebug('launch phantom profile', profile.name);
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(`chrome-extension://${phantomChromeExtensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
      await waitForPhantomUnlocked(page);
      walletDebug('phantom popup page', page.url());

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

async function launchCoinbaseFromChromeProfile(): Promise<WalletLaunch<null> | null> {
  const profiles = await findChromeProfiles([coinbaseChromeExtensionId]);
  if (profiles.length === 0) {
    return null;
  }

  const errors: string[] = [];

  for (const profile of profiles) {
    const extensionPath = await resolveProfileExtensionPath(profile.name, coinbaseChromeExtensionId);
    if (!extensionPath) {
      continue;
    }

    const context = await launchInstalledChromeProfileContext(profile.name);

    try {
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(`chrome-extension://${coinbaseChromeExtensionId}/index.html?inPageRequest=false`, {
        waitUntil: 'domcontentloaded',
      });
      await unlockCoinbasePages(context, coinbaseChromeExtensionId);

      return {
        context,
        extensionId: coinbaseChromeExtensionId,
        wallet: null,
      };
    } catch (error) {
      errors.push(`${profile.name}: ${error instanceof Error ? error.message : String(error)}`);
      await context.close().catch(() => {});
    }
  }

  if (requireChromeProfile && errors.length > 0) {
    throw new Error(`Failed to launch Coinbase Wallet from a copied Chrome profile: ${errors.join(' | ')}`);
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

export async function launchCoinbase(): Promise<WalletLaunch<null>> {
  const chromeProfileLaunch = await launchCoinbaseFromChromeProfile();
  if (chromeProfileLaunch) {
    return chromeProfileLaunch;
  }

  throw new Error('Coinbase Wallet launch requires a copied Chrome profile with the real extension installed');
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
