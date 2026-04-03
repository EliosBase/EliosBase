import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const tmpRoot = os.tmpdir();
const chromeExecutablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tmpPrefixes = ['elios-wallet-profile-', 'elios-wallet-e2e-'];
const localScratchPrefixes = ['.next.pre-wallet-', '.next.post-install-', '.next.wallet-'];
const localScratchPaths = [
  path.join(projectRoot, '.tmp'),
  path.join(projectRoot, 'output/playwright/wallet-results'),
];

async function rmIfExists(target) {
  await fs.rm(target, { recursive: true, force: true }).catch(() => {});
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupTmpDirs() {
  const entries = await fs.readdir(tmpRoot, { withFileTypes: true }).catch(() => []);

  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && tmpPrefixes.some((prefix) => entry.name.startsWith(prefix)))
    .map((entry) => rmIfExists(path.join(tmpRoot, entry.name))));
}

async function cleanupProjectScratch() {
  const entries = await fs.readdir(projectRoot, { withFileTypes: true }).catch(() => []);

  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && localScratchPrefixes.some((prefix) => entry.name.startsWith(prefix)))
    .map((entry) => rmIfExists(path.join(projectRoot, entry.name))));

  await Promise.all(localScratchPaths.map((target) => rmIfExists(target)));
}

async function killCopiedChromeProfiles() {
  try {
    const listCopiedProfilePids = async () => {
      const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,command=']);
      return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.includes(`${chromeExecutablePath} `))
      .map((line) => {
        const [pid, ...rest] = line.split(/\s+/);
        return {
          pid,
          command: rest.join(' '),
        };
      })
      .filter(({ command }) => command.includes('--user-data-dir=')
        && (command.includes('elios-wallet-profile-') || command.includes('elios-wallet-e2e-')))
      .map(({ pid }) => pid);
    };

    const copiedProfilePids = await listCopiedProfilePids();

    if (copiedProfilePids.length === 0) {
      return;
    }

    await execFileAsync('kill', copiedProfilePids);
    await delay(1_000);

    const survivingPids = await listCopiedProfilePids();
    if (survivingPids.length === 0) {
      return;
    }

    await execFileAsync('kill', ['-9', ...survivingPids]);
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error.code === 1 || error.code === 'ESRCH')
    ) {
      return;
    }

    throw error;
  }
}

await killCopiedChromeProfiles();
await cleanupTmpDirs();
await cleanupProjectScratch();

console.log('wallet e2e cleanup complete');
