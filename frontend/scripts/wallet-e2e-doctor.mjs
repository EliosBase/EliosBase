import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const chromeExecutablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chromeUserDataRoot = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
const forcedProfile = process.env.PLAYWRIGHT_WALLET_CHROME_PROFILE?.trim() || null;
const profiles = forcedProfile ? [forcedProfile] : ['Default', 'Profile 2'];
const wallets = [
  { name: 'MetaMask', extensionId: 'nkbihfbeogaeaoehlefnkodbefgpgknn' },
  { name: 'Phantom', extensionId: 'bfnaelmomeimhlpmgjnjophhpkkoljpa' },
  { name: 'Coinbase Wallet', extensionId: 'hnfanknocfeofbddgcijnmhnfnkdnaad' },
];

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function isChromeRunning() {
  try {
    await execFileAsync('pgrep', ['-x', 'Google Chrome']);
    return true;
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 1
    ) {
      return false;
    }

    throw error;
  }
}

async function resolveExtensionVersion(profileName, extensionId) {
  const extensionDir = path.join(chromeUserDataRoot, profileName, 'Extensions', extensionId);

  let entries;
  try {
    entries = await fs.readdir(extensionDir, { withFileTypes: true });
  } catch {
    return null;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
    .at(0) ?? null;
}

let hasFailures = false;

function ok(message) {
  console.log(`ok  ${message}`);
}

function warn(message) {
  console.warn(`warn ${message}`);
}

function fail(message) {
  console.error(`fail ${message}`);
  hasFailures = true;
}

if (await exists(chromeExecutablePath)) {
  ok(`chrome executable found at ${chromeExecutablePath}`);
} else {
  fail(`chrome executable missing at ${chromeExecutablePath}`);
}

if (await exists(chromeUserDataRoot)) {
  ok(`chrome user data root found at $HOME/Library/Application Support/Google/Chrome`);
} else {
  fail('chrome user data root is missing');
}

if (await isChromeRunning()) {
  warn('Google Chrome is running. Close it before wallet E2E copies a profile.');
} else {
  ok('Google Chrome is closed');
}

if (forcedProfile) {
  ok(`doctor pinned to Chrome profile ${forcedProfile}`);
}

for (const profileName of profiles) {
  const profileDir = path.join(chromeUserDataRoot, profileName);
  if (!(await exists(profileDir))) {
    warn(`profile ${profileName} is missing`);
    continue;
  }

  ok(`profile ${profileName} exists`);

  for (const wallet of wallets) {
    const version = await resolveExtensionVersion(profileName, wallet.extensionId);
    if (version) {
      ok(`${wallet.name} is installed in ${profileName} (${version})`);
      continue;
    }

    warn(`${wallet.name} is not installed in ${profileName}`);
  }
}

process.exit(hasFailures ? 1 : 0);
