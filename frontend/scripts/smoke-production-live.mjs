import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Wallet } from 'ethers';
import { SiweMessage } from 'siwe';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  fallback,
  formatEther,
  getAddress,
  http,
  isAddress,
  stringToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const LOCK_FUNDS_ABI = [
  {
    type: 'function',
    name: 'lockFunds',
    inputs: [
      { name: 'taskId', type: 'bytes32' },
      { name: 'agentId', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
];

const DEFAULT_BASE_RPC_URLS = [
  'https://base-rpc.publicnode.com',
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://1rpc.io/base',
  'https://base-mainnet.public.blastapi.io',
];

const DEFAULT_ARTIFACT_ROOT = 'output/production-live-e2e';
const DEFAULT_SYNC_TX_MODE = 'self-transfer';
const DEFAULT_MODE = 'core';

const baseUrl = readRequiredEnv('SMOKE_BASE_URL');
const siwePrivateKey = readRequiredEnv('SMOKE_SIWE_PRIVATE_KEY');
const agentId = readRequiredEnv('SMOKE_AGENT_ID');
const taskRewardWei = parseWeiEnv('SMOKE_TASK_REWARD_WEI');
const escrowLockWei = parseWeiEnv('SMOKE_ESCROW_LOCK_WEI');
const mode = normalizeMode(process.env.SMOKE_MODE);
const syncTxMode = normalizeSyncTxMode(process.env.SMOKE_SYNC_TX_MODE);
const postRunAdvance = isEnabled(process.env.SMOKE_POST_RUN_ADVANCE);
const captureScreenshots = isEnabled(process.env.SMOKE_CAPTURE_SCREENSHOTS);
const artifactRoot = process.env.SMOKE_ARTIFACT_DIR ?? path.join(DEFAULT_ARTIFACT_ROOT, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

const releaseFixture = {
  taskId: process.env.SMOKE_RELEASE_TASK_ID,
  txHash: process.env.SMOKE_RELEASE_TX_HASH,
};
const refundFixture = {
  taskId: process.env.SMOKE_REFUND_TASK_ID,
  txHash: process.env.SMOKE_REFUND_TX_HASH,
};

const rpcUrls = getBaseRpcUrls();
const account = privateKeyToAccount(asHex(siwePrivateKey));
const publicClient = createPublicClient({
  chain: base,
  transport: fallback(rpcUrls.map((url) => http(url, { timeout: 10_000 }))),
});
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(rpcUrls[0], { timeout: 10_000 }),
});

const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
const normalizedOrigin = new URL(normalizedBaseUrl).origin;
const runId = `prod-live-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
const logs = [];
const runState = {
  runId,
  mode,
  baseUrl: normalizedBaseUrl,
  walletAddress: account.address,
  agentId,
  escrowAddress: null,
  taskId: null,
  lockTxHash: null,
  syncTxHash: null,
  fixtureRelease: null,
  fixtureRefund: null,
  cleanup: null,
  steps: [],
};

let sessionCookie = process.env.SMOKE_SESSION_COOKIE ?? null;
let vercelProtectionCookie = null;
const vercelProtectionBypass = process.env.SMOKE_VERCEL_PROTECTION_BYPASS;

await fs.mkdir(artifactRoot, { recursive: true });
await writeJson('run.json', {
  runId,
  mode,
  baseUrl: normalizedBaseUrl,
  walletAddress: account.address,
  agentId,
  taskRewardWei: taskRewardWei.toString(),
  escrowLockWei: escrowLockWei.toString(),
  syncTxMode,
  postRunAdvance,
});

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function parseWeiEnv(name) {
  const value = readRequiredEnv(name);

  try {
    return BigInt(value);
  } catch {
    throw new Error(`${name} must be a base-10 integer amount in wei`);
  }
}

function asHex(value) {
  return value.startsWith('0x') ? value : `0x${value}`;
}

function normalizeMode(value) {
  if (value === 'full-fixture') {
    return value;
  }

  return DEFAULT_MODE;
}

function normalizeSyncTxMode(value) {
  if (value === 'reuse-lock') {
    return value;
  }

  return DEFAULT_SYNC_TX_MODE;
}

function isEnabled(value) {
  if (!value) {
    return false;
  }

  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

function getBaseRpcUrls() {
  const configured = [process.env.BASE_RPC_URL, process.env.BASE_RPC_FALLBACK_URLS]
    .flatMap((value) => value?.split(',') ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean);

  return Array.from(new Set([...configured, ...DEFAULT_BASE_RPC_URLS]));
}

function logStep(message, extra) {
  const line = `[smoke-production-live] ${new Date().toISOString()} ${message}`;
  logs.push(line);
  console.error(line);

  if (extra !== undefined) {
    runState.steps.push({ at: new Date().toISOString(), message, extra });
  } else {
    runState.steps.push({ at: new Date().toISOString(), message });
  }
}

async function writeJson(name, payload) {
  await fs.writeFile(path.join(artifactRoot, name), `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeText(name, payload) {
  await fs.writeFile(path.join(artifactRoot, name), payload);
}

function makeHeaders(extra = {}) {
  const headers = new Headers(extra);
  const cookies = [];

  if (vercelProtectionCookie) {
    cookies.push(`_vercel_jwt=${vercelProtectionCookie}`);
  }
  if (sessionCookie) {
    cookies.push(`eliosbase_session=${sessionCookie}`);
  }

  if (cookies.length > 0) {
    headers.set('cookie', cookies.join('; '));
  }

  return headers;
}

function makeMutationHeaders(extra = {}) {
  const headers = makeHeaders(extra);
  headers.set('origin', normalizedOrigin);

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return headers;
}

function extractCookie(res, name) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) {
    return null;
  }

  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ?? null;
}

async function request(route, init = {}, artifactName) {
  if (vercelProtectionBypass && !vercelProtectionCookie) {
    const bootstrapUrl = new URL(`${normalizedBaseUrl}${route}`);
    bootstrapUrl.searchParams.set('x-vercel-set-bypass-cookie', 'true');
    bootstrapUrl.searchParams.set('x-vercel-protection-bypass', vercelProtectionBypass);

    const bootstrapRes = await fetch(bootstrapUrl, {
      method: init.method ?? 'GET',
      headers: makeHeaders(init.headers),
      redirect: 'manual',
    });
    const bypassCookie = extractCookie(bootstrapRes, '_vercel_jwt');
    if (bypassCookie) {
      vercelProtectionCookie = bypassCookie;
    }
  }

  const res = await fetch(`${normalizedBaseUrl}${route}`, {
    ...init,
    headers: makeHeaders(init.headers),
  });
  const nextSessionCookie = extractCookie(res, 'eliosbase_session');
  if (nextSessionCookie) {
    sessionCookie = nextSessionCookie;
  }

  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text();

  if (artifactName) {
    await writeJson(`responses/${artifactName}.json`, {
      route,
      method: init.method ?? 'GET',
      status: res.status,
      ok: res.ok,
      contentType,
      body,
    });
  }

  return { res, body, contentType };
}

async function recordLogs() {
  await writeText('logs.txt', `${logs.join('\n')}\n`);
  await writeJson('summary.json', runState);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatReward(wei) {
  return `${formatEther(wei)} ETH`;
}

async function checkHtml(route, label) {
  const { res, body } = await request(route, {}, label);
  assert(res.ok, `${label} returned ${res.status}`);
  assert(typeof body === 'string' && body.includes('<html'), `${label} did not return HTML`);
  logStep(`PASS ${label}`);
}

async function checkJson(route, label, expectedStatus, validate, init = {}) {
  const { res, body, contentType } = await request(route, init, label);
  const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];

  assert(allowed.includes(res.status), `${label} returned ${res.status}, expected ${allowed.join(' or ')}`);
  assert(contentType.includes('application/json'), `${label} did not return JSON`);
  validate(body);
  logStep(`PASS ${label}`);
  return body;
}

async function waitFor(check, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const started = Date.now();

  while (true) {
    const result = await check();
    if (result) {
      return result;
    }

    if (Date.now() - started >= timeoutMs) {
      throw new Error(options.message ?? 'Timed out waiting for condition');
    }

    await sleep(intervalMs);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginWithSiwe() {
  const wallet = new Wallet(siwePrivateKey);
  const nonceBody = await checkJson('/api/auth/nonce', 'auth nonce', 200, (body) => {
    assert(typeof body?.nonce === 'string' && body.nonce.length > 0, 'auth nonce missing nonce');
  });

  const message = new SiweMessage({
    domain: new URL(normalizedOrigin).host,
    address: wallet.address,
    statement: 'Sign in to EliosBase live production smoke checks.',
    uri: normalizedOrigin,
    version: '1',
    chainId: Number(process.env.SMOKE_SIWE_CHAIN_ID || 8453),
    nonce: nonceBody.nonce,
    issuedAt: new Date().toISOString(),
  });
  const preparedMessage = message.prepareMessage();
  const signature = await wallet.signMessage(preparedMessage);

  await checkJson(
    '/api/auth/verify',
    'siwe login',
    200,
    (body) => {
      assert(body?.authenticated === true, 'siwe login missing authenticated=true');
      assert(typeof body?.walletAddress === 'string', 'siwe login missing walletAddress');
      assert(body.walletAddress.toLowerCase() === wallet.address.toLowerCase(), 'siwe session wallet mismatch');
    },
    {
      method: 'POST',
      headers: makeMutationHeaders(),
      body: JSON.stringify({ message: preparedMessage, signature }),
    },
  );

  await checkJson('/api/auth/session', 'auth session authenticated', 200, (body) => {
    assert(body?.authenticated === true, 'auth session did not authenticate');
    assert(body?.walletAddress?.toLowerCase() === wallet.address.toLowerCase(), 'auth session wallet mismatch');
  });
}

async function resolveEscrowAddress() {
  const { res, body } = await request('/miniapp', {}, 'miniapp-page');
  assert(res.ok, `/miniapp returned ${res.status}`);
  assert(typeof body === 'string', '/miniapp did not return HTML');

  const match = body.match(/var ESCROW='(0x[a-fA-F0-9]{40})'/);
  assert(match, 'Failed to resolve escrow contract address from /miniapp');

  const escrowAddress = getAddress(match[1]);
  runState.escrowAddress = escrowAddress;
  await writeJson('escrow.json', { escrowAddress });
  return escrowAddress;
}

async function createSmokeTask() {
  const title = `Production smoke ${runId}`;
  const description = [
    'Automated launch sign-off task.',
    `run_id=${runId}`,
    `agent_id=${agentId}`,
    `wallet=${account.address}`,
  ].join(' ');

  const task = await checkJson(
    '/api/tasks',
    'task create',
    201,
    (body) => {
      assert(typeof body?.id === 'string', 'task create missing id');
      assert(body?.title === title, 'task create returned unexpected title');
    },
    {
      method: 'POST',
      headers: makeMutationHeaders(),
      body: JSON.stringify({
        title,
        description,
        reward: formatReward(taskRewardWei),
      }),
    },
  );

  runState.taskId = task.id;
  await waitFor(async () => {
    const tasks = await checkJson('/api/tasks?mine=true&limit=20', 'tasks mine', 200, (body) => {
      assert(Array.isArray(body), 'tasks mine is not an array');
    });
    return tasks.find((candidate) => candidate.id === task.id) ?? null;
  }, { timeoutMs: 15_000, message: 'Created task did not appear in mine=true listing' });

  return task;
}

async function sendEscrowLock(taskId, escrowAddress) {
  const hash = await sendTransactionWithRetries({
    to: escrowAddress,
    data: encodeFunctionData({
      abi: LOCK_FUNDS_ABI,
      functionName: 'lockFunds',
      args: [
        stringToHex(taskId, { size: 32 }),
        stringToHex(agentId, { size: 32 }),
      ],
    }),
    value: escrowLockWei,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  runState.lockTxHash = hash;
  await writeJson('lock-transaction.json', {
    taskId,
    agentId,
    valueWei: escrowLockWei.toString(),
    txHash: hash,
  });
  logStep('PASS on-chain escrow lock', { txHash: hash });
  return hash;
}

async function sendSyncTransaction(lockTxHash) {
  if (syncTxMode === 'reuse-lock') {
    runState.syncTxHash = lockTxHash;
    return {
      txHash: lockTxHash,
      to: runState.escrowAddress,
      amount: formatReward(escrowLockWei),
    };
  }

  const hash = await sendTransactionWithRetries({
    to: account.address,
    value: 0n,
    data: '0x',
  });
  await publicClient.waitForTransactionReceipt({ hash });
  runState.syncTxHash = hash;
  await writeJson('sync-transaction.json', {
    mode: syncTxMode,
    txHash: hash,
    from: account.address,
    to: account.address,
  });
  logStep('PASS on-chain sync transaction', { txHash: hash });
  return {
    txHash: hash,
    to: account.address,
    amount: '0',
  };
}

async function verifyCoreWrites(taskId, lockTxHash, syncTx) {
  await checkJson(
    `/api/agents/${agentId}/hire`,
    'agent hire',
    201,
    (body) => {
      assert(body?.success === true, 'agent hire missing success=true');
      assert(body?.txHash === lockTxHash, 'agent hire echoed unexpected txHash');
    },
    {
      method: 'POST',
      headers: makeMutationHeaders(),
      body: JSON.stringify({ taskId, txHash: lockTxHash }),
    },
  );

  await checkJson(
    '/api/transactions/sync',
    'transaction sync write',
    201,
    (body) => {
      assert(typeof body?.id === 'string', 'transaction sync write missing id');
      assert(body?.txHash === syncTx.txHash, 'transaction sync write echoed unexpected txHash');
    },
    {
      method: 'POST',
      headers: makeMutationHeaders(),
      body: JSON.stringify({
        type: 'payment',
        from: account.address,
        to: syncTx.to,
        amount: syncTx.amount,
        token: 'ETH',
        txHash: syncTx.txHash,
      }),
    },
  );

  const taskDetail = await waitFor(async () => {
    const body = await checkJson(`/api/tasks/${taskId}`, 'task detail', 200, (payload) => {
      assert(typeof payload?.id === 'string', 'task detail missing id');
    });

    return body.assignedAgent === agentId
      ? body
      : null;
  }, { timeoutMs: 20_000, intervalMs: 2_000, message: 'Assigned task state did not converge' });

  assert(taskDetail.currentStep === 'Assigned', 'task detail did not reach Assigned');

  const agentDetail = await waitFor(async () => {
    const body = await checkJson(`/api/agents/${agentId}`, 'agent detail', 200, (payload) => {
      assert(typeof payload?.id === 'string', 'agent detail missing id');
    });

    return body.status === 'busy' ? body : null;
  }, { timeoutMs: 20_000, intervalMs: 2_000, message: 'Agent did not become busy after hire' });

  assert(agentDetail.status === 'busy', 'agent detail did not reflect busy state');

  const transactions = await waitFor(async () => {
    const body = await checkJson('/api/transactions', 'transactions', 200, (payload) => {
      assert(Array.isArray(payload), 'transactions is not an array');
    });
    const hashes = new Set(body.map((row) => row.txHash));

    return hashes.has(lockTxHash) && hashes.has(syncTx.txHash) ? body : null;
  }, { timeoutMs: 20_000, intervalMs: 2_000, message: 'New transactions did not appear in listing' });

  const activity = await waitFor(async () => {
    const body = await checkJson('/api/activity', 'activity feed', 200, (payload) => {
      assert(Array.isArray(payload), 'activity feed is not an array');
    });

    const hasTaskLog = body.some((event) => typeof event?.message === 'string' && event.message.includes(taskId.slice(-6)));
    const hasHireLog = body.some((event) => typeof event?.message === 'string' && event.message.includes('Agent hired'));
    return hasTaskLog || hasHireLog ? body : null;
  }, { timeoutMs: 20_000, intervalMs: 2_000, message: 'Activity feed did not reflect the smoke write path' });

  await writeJson('core-state.json', {
    task: taskDetail,
    agent: agentDetail,
    transactionHashes: transactions.map((row) => row.txHash),
    activity: activity.slice(0, 10),
  });
}

async function maybeAdvanceTask(taskId) {
  if (!postRunAdvance) {
    return;
  }

  const cleanup = {
    taskId,
    attempts: [],
  };

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const task = await checkJson(`/api/tasks/${taskId}`, `cleanup task detail ${attempt}`, 200, (body) => {
      assert(typeof body?.id === 'string', 'cleanup task detail missing id');
    });

    if (task.status !== 'active') {
      cleanup.finalTask = task;
      cleanup.releasedAgent = true;
      runState.cleanup = cleanup;
      await writeJson('cleanup.json', cleanup);
      return;
    }

    const { res, body, contentType } = await request(
      `/api/tasks/${taskId}/advance`,
      {
        method: 'POST',
        headers: makeMutationHeaders(),
      },
      `task-advance-${attempt}`,
    );

    assert([200, 500].includes(res.status), `task advance ${attempt} returned ${res.status}`);
    assert(contentType.includes('application/json'), `task advance ${attempt} did not return JSON`);
    assert(isRecord(body), 'task advance response changed shape');
    logStep(`task advance ${attempt} returned ${res.status}`, body);

    cleanup.attempts.push({ attempt, task, advance: body, status: res.status });

    const agent = await checkJson(`/api/agents/${agentId}`, `cleanup agent detail ${attempt}`, 200, (body) => {
      assert(typeof body?.id === 'string', 'cleanup agent detail missing id');
    });

    if (agent.status === 'online') {
      cleanup.finalTask = await checkJson(`/api/tasks/${taskId}`, `cleanup final task detail ${attempt}`, 200, (body) => {
        assert(typeof body?.id === 'string', 'cleanup final task detail missing id');
      });
      cleanup.releasedAgent = true;
      runState.cleanup = cleanup;
      await writeJson('cleanup.json', cleanup);
      return;
    }

    await sleep(resolveAdvanceDelay(body));
  }

  cleanup.releasedAgent = false;
  runState.cleanup = cleanup;
  await writeJson('cleanup.json', cleanup);
  logStep('WARN cleanup did not return the smoke agent to online');
}

function resolveAdvanceDelay(advance) {
  const reason = typeof advance?.reason === 'string' ? advance.reason : '';
  const match = reason.match(/Need (\d+)s/);
  if (match) {
    return (Number.parseInt(match[1], 10) + 2) * 1_000;
  }

  if (advance?.advanced === false) {
    return 10_000;
  }

  return 2_000;
}

async function verifyFixtureFlow(label, route, fixture, expectedTaskCheck) {
  assert(typeof fixture.taskId === 'string' && fixture.taskId.length > 0, `${label} fixture task id is required`);
  assert(typeof fixture.txHash === 'string' && fixture.txHash.startsWith('0x'), `${label} fixture tx hash is required`);

  const task = await checkJson(`/api/tasks/${fixture.taskId}`, `${label} task detail`, 200, (body) => {
    assert(typeof body?.id === 'string', `${label} task detail missing id`);
  });

  expectedTaskCheck(task);

  await checkJson(
    route.replace(':id', fixture.taskId),
    `${label} write`,
    200,
    (body) => {
      assert(body?.success === true, `${label} write missing success=true`);
      assert(body?.taskId === fixture.taskId, `${label} write returned unexpected taskId`);
    },
    {
      method: 'POST',
      headers: makeMutationHeaders(),
      body: JSON.stringify({ txHash: fixture.txHash }),
    },
  );

  const transactions = await waitFor(async () => {
    const body = await checkJson('/api/transactions', `${label} transactions`, 200, (payload) => {
      assert(Array.isArray(payload), `${label} transactions is not an array`);
    });

    return body.some((row) => row.txHash === fixture.txHash) ? body : null;
  }, { timeoutMs: 20_000, intervalMs: 2_000, message: `${label} transaction did not persist` });

  await writeJson(`${label}.json`, {
    task,
    txHash: fixture.txHash,
    transactionCount: transactions.length,
  });

  if (label === 'release') {
    runState.fixtureRelease = { taskId: fixture.taskId, txHash: fixture.txHash };
  } else {
    runState.fixtureRefund = { taskId: fixture.taskId, txHash: fixture.txHash };
  }
}

async function captureFailureArtifacts() {
  await writeText('failure.log', `${logs.join('\n')}\n`);

  const snapshots = [
    { label: 'homepage', route: '/' },
    { label: 'app', route: '/app' },
  ];

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    for (const snapshot of snapshots) {
      const url = `${normalizedBaseUrl}${snapshot.route}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.screenshot({
        path: path.join(artifactRoot, `${snapshot.label}.png`),
        fullPage: true,
      });
      await writeText(`${snapshot.label}.html`, await page.content());
    }

    await browser.close();
  } catch (error) {
    logStep('WARN failed to capture Playwright screenshots', {
      error: error instanceof Error ? error.message : String(error),
    });

    for (const snapshot of snapshots) {
      const { body } = await request(snapshot.route, {}, `${snapshot.label}-failure`);
      if (typeof body === 'string') {
        await writeText(`${snapshot.label}.html`, body);
      }
    }
  }
}

async function sendTransactionWithRetries(request) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tx = await getPendingEip1559TxParams(attempt);

    try {
      const gas = await publicClient.estimateGas({
        account: account.address,
        to: request.to,
        value: request.value ?? 0n,
        data: request.data,
        ...tx,
      });

      return await walletClient.sendTransaction({
        account,
        chain: base,
        to: request.to,
        value: request.value ?? 0n,
        data: request.data,
        gas: ceilRatio(gas, 15n, 10n),
        ...tx,
      });
    } catch (error) {
      if (attempt === 2 || !isUnderpricedTransactionError(error)) {
        throw error;
      }
    }
  }

  throw new Error('Transaction fee retries exhausted');
}

async function getPendingEip1559TxParams(attempt = 0) {
  const [estimate, block, nonce] = await Promise.all([
    publicClient.estimateFeesPerGas({ type: 'eip1559' }).catch(() => undefined),
    publicClient.getBlock().catch(() => undefined),
    getMaxPendingNonce(),
  ]);

  const multiplier = 2n ** BigInt(attempt);
  const baseFeePerGas = block?.baseFeePerGas ?? 0n;
  const estimatedPriorityFee = estimate?.maxPriorityFeePerGas ?? 0n;
  const estimatedMaxFee = estimate?.maxFeePerGas ?? 0n;

  let maxPriorityFeePerGas = max(estimatedPriorityFee, 1_000_000n * multiplier);
  let maxFeePerGas = max(estimatedMaxFee, baseFeePerGas * 2n + maxPriorityFeePerGas);

  maxPriorityFeePerGas = ceilRatio(maxPriorityFeePerGas, 12n, 10n);
  maxFeePerGas = max(ceilRatio(maxFeePerGas, 12n, 10n), maxPriorityFeePerGas * 2n);

  return {
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

async function getMaxPendingNonce() {
  const settled = await Promise.allSettled(
    rpcUrls.map(async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionCount',
          params: [account.address, 'pending'],
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.result) {
        throw new Error(`Failed to fetch pending nonce from ${url}`);
      }

      return Number.parseInt(payload.result, 16);
    }),
  );

  const counts = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  if (counts.length === 0) {
    throw new Error('Failed to fetch a pending nonce from any Base RPC');
  }

  return Math.max(...counts);
}

function isUnderpricedTransactionError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('underpriced')
    || normalized.includes('replacement transaction underpriced')
    || normalized.includes('fee too low');
}

function max(left, right) {
  return left > right ? left : right;
}

function ceilRatio(value, numerator, denominator) {
  return (value * numerator + denominator - 1n) / denominator;
}

async function main() {
  logStep(`Starting live production smoke run ${runId}`, {
    mode,
    baseUrl: normalizedBaseUrl,
    walletAddress: account.address,
  });

  await fs.mkdir(path.join(artifactRoot, 'responses'), { recursive: true });

  await checkHtml('/', 'homepage');
  await checkHtml('/app', 'app shell');
  await loginWithSiwe();
  await checkJson('/api/health', 'health', 200, (body) => {
    assert(body?.ok === true, 'health missing ok');
    assert(body?.status === 'live', 'health missing live status');
  });
  await checkJson('/api/ready', 'readiness', 200, (body) => {
    assert(body?.ok === true, 'readiness missing ok');
    assert(body?.status === 'ready', 'readiness missing ready status');
  });

  const escrowAddress = await resolveEscrowAddress();
  assert(isAddress(escrowAddress), 'Resolved escrow address is invalid');

  const task = await createSmokeTask();
  const lockTxHash = await sendEscrowLock(task.id, escrowAddress);
  const syncTx = await sendSyncTransaction(lockTxHash);
  await verifyCoreWrites(task.id, lockTxHash, syncTx);
  await maybeAdvanceTask(task.id);

  if (mode === 'full-fixture') {
    await verifyFixtureFlow(
      'release',
      '/api/tasks/:id/release',
      releaseFixture,
      (fixtureTask) => {
        assert(fixtureTask.status === 'completed', 'release fixture task is not completed');
        assert(fixtureTask.currentStep === 'Complete', 'release fixture task is not at Complete');
      },
    );

    await verifyFixtureFlow(
      'refund',
      '/api/tasks/:id/refund',
      refundFixture,
      (fixtureTask) => {
        assert(
          fixtureTask.status === 'failed' || fixtureTask.hasOpenDispute === true,
          'refund fixture task must be failed or disputed',
        );
      },
    );
  }

  logStep('Live production smoke checks passed');
  await recordLogs();
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  runState.error = message;
  logStep(`FAIL ${message}`);
  if (captureScreenshots) {
    await captureFailureArtifacts();
  }
  await recordLogs();
  throw error;
}
