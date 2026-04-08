import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';

const DEFAULT_ARTIFACT_ROOT = 'output/preview-live-x402';
const DEFAULT_NETWORK = 'eip155:84532';

const baseUrl = readRequiredEnv('SMOKE_BASE_URL');
const privateKey = readRequiredEnv('SMOKE_X402_PRIVATE_KEY');
const explicitAgentId = process.env.SMOKE_AGENT_ID?.trim() ?? null;
const configuredNetwork = process.env.SMOKE_X402_NETWORK?.trim() || DEFAULT_NETWORK;
const captureScreenshots = isEnabled(process.env.SMOKE_CAPTURE_SCREENSHOTS);
const vercelProtectionBypass = process.env.SMOKE_VERCEL_PROTECTION_BYPASS?.trim() ?? null;
const artifactRoot = process.env.SMOKE_ARTIFACT_DIR ?? path.join(
  DEFAULT_ARTIFACT_ROOT,
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
);

const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
const normalizedOrigin = new URL(normalizedBaseUrl).origin;
const account = privateKeyToAccount(asHex(privateKey));
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      network: configuredNetwork,
      client: new ExactEvmScheme(account),
    },
  ],
});

const runState = {
  runId: `preview-x402-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  baseUrl: normalizedBaseUrl,
  walletAddress: account.address,
  configuredNetwork,
  agentId: null,
  taskId: null,
  taskUrl: null,
  receiptUrl: null,
  paymentTxHash: null,
  paymentResponse: null,
};

let vercelProtectionCookie = null;
let browser = null;
let page = null;

await fs.mkdir(artifactRoot, { recursive: true });
await writeJson('run.json', runState);

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function isEnabled(value) {
  if (!value) {
    return false;
  }

  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

function asHex(value) {
  return value.startsWith('0x') ? value : `0x${value}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function toRouteUrl(pathname) {
  return pathname.startsWith('http://') || pathname.startsWith('https://')
    ? pathname
    : `${normalizedBaseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function makeHeaders(extra = {}) {
  const headers = new Headers(extra);
  const cookies = [];

  if (vercelProtectionCookie) {
    cookies.push(`_vercel_jwt=${vercelProtectionCookie}`);
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

async function ensureVercelBypassCookie(route = '/api/health') {
  if (!vercelProtectionBypass || vercelProtectionCookie) {
    return;
  }

  const bootstrapUrl = new URL(toRouteUrl(route));
  bootstrapUrl.searchParams.set('x-vercel-set-bypass-cookie', 'true');
  bootstrapUrl.searchParams.set('x-vercel-protection-bypass', vercelProtectionBypass);

  const response = await fetch(bootstrapUrl, {
    headers: makeHeaders(),
    redirect: 'manual',
  });
  const bypassCookie = extractCookie(response, '_vercel_jwt');
  if (bypassCookie) {
    vercelProtectionCookie = bypassCookie;
  }
}

async function request(route, init = {}, artifactName) {
  await ensureVercelBypassCookie(route);

  const response = await fetch(toRouteUrl(route), {
    ...init,
    headers: makeHeaders(init.headers),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text();

  if (artifactName) {
    await writeJson(artifactName, {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    });
  }

  return { response, body, contentType };
}

async function writeJson(name, payload) {
  await fs.writeFile(path.join(artifactRoot, name), `${JSON.stringify(payload, null, 2)}\n`);
}

async function launchBrowser() {
  if (!captureScreenshots || browser) {
    return;
  }

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
}

async function captureScreenshot(name, url) {
  if (!captureScreenshots) {
    return;
  }

  await launchBrowser();

  const target = new URL(toRouteUrl(url));
  if (vercelProtectionBypass) {
    target.searchParams.set('x-vercel-set-bypass-cookie', 'true');
    target.searchParams.set('x-vercel-protection-bypass', vercelProtectionBypass);
  }

  await page.goto(target.toString(), { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(artifactRoot, `${name}.png`), fullPage: true });
}

async function resolvePayableAgent() {
  const { response, body } = await request('/api/agents', {}, 'agents.json');
  assert(response.status === 200, `/api/agents returned ${response.status}`);
  assert(Array.isArray(body), '/api/agents did not return an array');

  const candidates = [
    explicitAgentId,
    ...body.map((agent) => agent?.id),
  ].filter((value, index, list) => typeof value === 'string' && value.length > 0 && list.indexOf(value) === index);

  for (const candidateId of candidates) {
    const result = await request(`/api/agents/${encodeURIComponent(candidateId)}/capabilities`);
    if (result.response.status === 404) {
      continue;
    }

    assert(result.response.status === 200, `capabilities for ${candidateId} returned ${result.response.status}`);
    assert(Array.isArray(result.body?.paymentMethods) && result.body.paymentMethods.length > 0, `capabilities for ${candidateId} missing paymentMethods`);
    assert(Array.isArray(result.body?.payableCapabilities) && result.body.payableCapabilities.length > 0, `capabilities for ${candidateId} missing payableCapabilities`);

    await writeJson('capabilities.json', result.body);
    return { agentId: candidateId, manifest: result.body };
  }

  throw new Error('No x402-configured preview agent found');
}

async function run() {
  const { agentId, manifest } = await resolvePayableAgent();
  const executeUrl = manifest?.links?.executeUrl;
  const executePath = new URL(executeUrl).pathname;
  const body = {
    title: `Preview paid execute ${Date.now()}`,
    description: 'Run one paid preview execution through the canonical x402 HTTP route and persist the task receipt.',
  };

  runState.agentId = agentId;
  await writeJson('run.json', runState);

  const unpaid = await request(executePath, {
    method: 'POST',
    headers: makeMutationHeaders(),
    body: JSON.stringify(body),
  }, 'unpaid-challenge.json');

  assert(unpaid.response.status === 402, `unpaid execute returned ${unpaid.response.status}`);
  assert(unpaid.body?.code === 'payment_required', 'unpaid execute did not return payment_required');

  await ensureVercelBypassCookie(executePath);
  const paidResponse = await fetchWithPayment(toRouteUrl(executePath), {
    method: 'POST',
    headers: makeMutationHeaders(),
    body: JSON.stringify(body),
  });
  const paidContentType = paidResponse.headers.get('content-type') ?? '';
  const paidBody = paidContentType.includes('application/json')
    ? await paidResponse.json().catch(() => null)
    : await paidResponse.text();

  await writeJson('execute-response.json', {
    status: paidResponse.status,
    headers: Object.fromEntries(paidResponse.headers.entries()),
    body: paidBody,
  });

  assert(paidResponse.status === 201, `paid execute returned ${paidResponse.status}`);
  assert(typeof paidBody?.taskId === 'string', 'paid execute missing taskId');
  assert(typeof paidBody?.taskUrl === 'string', 'paid execute missing taskUrl');
  assert(typeof paidBody?.receiptUrl === 'string', 'paid execute missing receiptUrl');

  const paymentHeader = paidResponse.headers.get('PAYMENT-RESPONSE') ?? paidResponse.headers.get('X-PAYMENT-RESPONSE');
  const decodedPayment = paymentHeader ? decodePaymentResponseHeader(paymentHeader) : null;
  if (decodedPayment) {
    await writeJson('payment-response.json', decodedPayment);
  }

  runState.taskId = paidBody.taskId;
  runState.taskUrl = paidBody.taskUrl;
  runState.receiptUrl = paidBody.receiptUrl;
  runState.paymentTxHash = paidBody.txHash ?? decodedPayment?.transaction ?? null;
  runState.paymentResponse = decodedPayment;
  await writeJson('run.json', runState);

  const receiptPath = new URL(paidBody.receiptUrl).pathname;
  const receipt = await request(receiptPath, {}, 'receipt.json');
  assert(receipt.response.status === 200, `receipt returned ${receipt.response.status}`);
  assert(receipt.body?.identity?.id === paidBody.taskId, 'receipt identity.id does not match task');
  assert(receipt.body?.payment?.method === 'x402', 'receipt payment.method is not x402');
  assert(['accepted', 'settled'].includes(receipt.body?.payment?.status), 'receipt payment.status is not accepted/settled');

  const activity = await request(
    `/api/activity?entityType=task&entityId=${encodeURIComponent(paidBody.taskId)}&limit=10`,
    {},
    'activity.json',
  );
  assert(activity.response.status === 200, `task activity returned ${activity.response.status}`);
  assert(Array.isArray(activity.body), 'task activity did not return an array');
  assert(activity.body.some((event) => event?.eventType === 'payment.accepted'), 'task activity is missing payment.accepted');
  assert(
    activity.body.some((event) => ['execution.started', 'execution.completed', 'execution.failed'].includes(event?.eventType)),
    'task activity is missing execution lifecycle events',
  );

  await captureScreenshot('agent-passport', manifest.links.pageUrl);
  await captureScreenshot('task-receipt', paidBody.taskUrl);

  console.log('Preview x402 paid execution checks passed');
}

try {
  await run();
} catch (error) {
  await writeJson('run.json', {
    ...runState,
    error: error instanceof Error ? error.message : String(error),
  }).catch(() => {});

  if (runState.taskUrl) {
    await captureScreenshot('task-receipt-failure', runState.taskUrl).catch(() => {});
  }

  if (runState.agentId) {
    await captureScreenshot('agent-passport-failure', `/agents/${encodeURIComponent(runState.agentId)}`).catch(() => {});
  }

  throw error;
} finally {
  await browser?.close();
}
