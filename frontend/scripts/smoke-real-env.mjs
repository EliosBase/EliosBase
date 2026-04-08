import { Wallet } from 'ethers';
import { SiweMessage } from 'siwe';

const baseUrl = process.env.SMOKE_BASE_URL;
const cronSecret = process.env.SMOKE_CRON_SECRET;
const resultTaskId = process.env.SMOKE_TASK_ID;
const siwePrivateKey = process.env.SMOKE_SIWE_PRIVATE_KEY;
const agentId = process.env.SMOKE_AGENT_ID;
const taskCreateBody = parseJsonEnv('SMOKE_TASK_CREATE_BODY');
const hireBody = parseJsonEnv('SMOKE_HIRE_BODY');
const txSyncBody = parseJsonEnv('SMOKE_TX_SYNC_BODY');
let sessionCookie = process.env.SMOKE_SESSION_COOKIE;
const vercelProtectionBypass = process.env.SMOKE_VERCEL_PROTECTION_BYPASS;
let vercelProtectionCookie = null;
const expectAuthenticatedSession = Boolean(sessionCookie || siwePrivateKey);

if (!baseUrl) {
  console.error('SMOKE_BASE_URL is required');
  process.exit(1);
}

const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
const normalizedOrigin = new URL(normalizedBaseUrl).origin;

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
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

async function request(path, init = {}) {
  if (vercelProtectionBypass && !vercelProtectionCookie) {
    const bootstrapUrl = new URL(`${normalizedBaseUrl}${path}`);
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

  const res = await fetch(`${normalizedBaseUrl}${path}`, {
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

  return { res, body, contentType };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function checkHtml(path, label) {
  const { res, body } = await request(path);
  assert(res.ok, `${label} returned ${res.status}`);
  assert(typeof body === 'string' && body.includes('<html'), `${label} did not return HTML`);
  console.log(`PASS ${label}`);
}

async function checkJson(path, label, expectedStatus, validate, init = {}) {
  const { res, body, contentType } = await request(path, init);
  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  assert(expectedStatuses.includes(res.status), `${label} returned ${res.status}, expected ${expectedStatuses.join(' or ')}`);
  assert(contentType.includes('application/json'), `${label} did not return JSON`);
  validate(body);
  console.log(`PASS ${label}`);
  return body;
}

async function loginWithSiwe() {
  const wallet = new Wallet(siwePrivateKey);
  const nonceBody = await checkJson('/api/auth/nonce', 'auth nonce', 200, (body) => {
    assert(typeof body?.nonce === 'string' && body.nonce.length > 0, 'auth nonce missing nonce');
  });

  const message = new SiweMessage({
    domain: new URL(normalizedOrigin).host,
    address: wallet.address,
    statement: 'Sign in to EliosBase smoke checks.',
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
    },
    {
      method: 'POST',
      headers: makeMutationHeaders(),
      body: JSON.stringify({ message: preparedMessage, signature }),
    },
  );
}

await checkHtml('/', 'homepage');

if (siwePrivateKey) {
  await loginWithSiwe();
} else {
  await checkJson('/api/auth/nonce', 'auth nonce', 200, (body) => {
    assert(typeof body?.nonce === 'string' && body.nonce.length > 0, 'auth nonce missing nonce');
  });
}

await checkJson('/api/health', 'health', 200, (body) => {
  assert(body?.ok === true, 'health missing ok');
  assert(body?.status === 'live', 'health missing live status');
});

await checkJson('/api/ready', 'readiness', 200, (body) => {
  assert(body?.ok === true, 'ready missing ok');
  assert(body?.status === 'ready', 'ready missing ready status');
  assert(Array.isArray(body?.checks), 'ready missing checks');
});

await checkJson('/api/auth/session', 'auth session', 200, (body) => {
  assert(typeof body?.authenticated === 'boolean', 'auth session missing authenticated flag');
});

const agents = await checkJson('/api/agents', 'agents listing', 200, (body) => {
  assert(Array.isArray(body), 'agents listing is not an array');
});

const tasks = await checkJson('/api/tasks', 'tasks listing', 200, (body) => {
  assert(Array.isArray(body), 'tasks listing is not an array');
});

await checkJson('/api/activity', 'activity feed', 200, (body) => {
  assert(Array.isArray(body), 'activity feed is not an array');
});

const publicAgent = Array.isArray(agents) ? agents[0] : null;
if (publicAgent?.id) {
  await checkHtml(`/agents/${publicAgent.id}`, 'agent passport page');
  await checkJson(`/api/agents/${publicAgent.id}/passport`, 'agent passport json', 200, (body) => {
    assert(body?.identity?.id === publicAgent.id, 'agent passport missing identity.id');
    assert(typeof body?.pageUrl === 'string', 'agent passport missing pageUrl');
    assert(typeof body?.frameUrl === 'string', 'agent passport missing frameUrl');
    assert(typeof body?.warpcastShareUrl === 'string', 'agent passport missing warpcastShareUrl');
    assert(Array.isArray(body?.activity), 'agent passport missing activity');
  });
}

const publicTask = Array.isArray(tasks) ? tasks[0] : null;
if (publicTask?.id) {
  await checkHtml(`/tasks/${publicTask.id}`, 'task receipt page');
  await checkJson(`/api/tasks/${publicTask.id}/receipt`, 'task receipt json', 200, (body) => {
    assert(body?.identity?.id === publicTask.id, 'task receipt missing identity.id');
    assert(typeof body?.pageUrl === 'string', 'task receipt missing pageUrl');
    assert(typeof body?.frameUrl === 'string', 'task receipt missing frameUrl');
    assert(typeof body?.warpcastShareUrl === 'string', 'task receipt missing warpcastShareUrl');
    assert(Array.isArray(body?.timeline), 'task receipt missing timeline');
  });
}

await checkJson('/api/activity?entityType=task&limit=5', 'task graph feed', 200, (body) => {
  assert(Array.isArray(body), 'task graph feed is not an array');
  body.forEach((event) => {
    assert(typeof event?.eventType === 'string', 'task graph feed missing eventType');
  });
});

await checkJson('/api/stats', 'dashboard stats', 200, (body) => {
  assert(typeof body?.activeAgents === 'number', 'dashboard stats missing activeAgents');
  assert(typeof body?.activeTasks === 'number', 'dashboard stats missing activeTasks');
  assert(typeof body?.zkProofs === 'number', 'dashboard stats missing zkProofs');
});

if (expectAuthenticatedSession) {
  await checkJson('/api/auth/session', 'auth session authenticated', 200, (body) => {
    assert(body?.authenticated === true, 'auth session did not authenticate');
    assert(typeof body?.walletAddress === 'string', 'auth session missing walletAddress');
  });

  await checkJson('/api/transactions', 'transactions', 200, (body) => {
    assert(Array.isArray(body), 'transactions is not an array');
  });

  await checkJson('/api/transactions/sync', 'transaction sync read', 200, (body) => {
    assert(isRecord(body?.synced), 'transaction sync read missing synced payload');
  });

  await checkJson('/api/security/stats', 'security stats', [200, 403], (body) => {
    if (isRecord(body) && 'error' in body) {
      console.log('SKIP security stats detail (admin session required)');
      return;
    }

    assert(typeof body?.threatsBlocked === 'number', 'security stats missing threatsBlocked');
    assert(typeof body?.guardrailsActive === 'number', 'security stats missing guardrailsActive');
    assert(typeof body?.auditEntries === 'number', 'security stats missing auditEntries');
  });

  await checkJson('/api/wallet/stats', 'wallet stats', 200, (body) => {
    assert(typeof body?.balance === 'string', 'wallet stats missing balance');
    assert(typeof body?.inEscrow === 'string', 'wallet stats missing inEscrow');
  });

  if (agentId) {
    await checkJson(`/api/agents/${agentId}/wallet/session`, 'agent wallet session', 200, (body) => {
      assert(body?.agentId === agentId, 'agent wallet session missing agentId');
      assert(typeof body?.walletStatus === 'string', 'agent wallet session missing walletStatus');
    });

    await checkJson(`/api/agents/${agentId}/wallet/transfers?limit=5`, 'agent wallet transfers', 200, (body) => {
      assert(Array.isArray(body), 'agent wallet transfers is not an array');
    });
  } else {
    console.log('SKIP agent wallet read-only smoke (SMOKE_AGENT_ID not set)');
  }

  if (txSyncBody) {
    assert(isRecord(txSyncBody), 'SMOKE_TX_SYNC_BODY must be a JSON object');
    await checkJson(
      '/api/transactions/sync',
      'transaction sync write',
      201,
      (body) => {
        assert(typeof body?.id === 'string', 'transaction sync write missing id');
        assert(typeof body?.txHash === 'string', 'transaction sync write missing txHash');
      },
      {
        method: 'POST',
        headers: makeMutationHeaders(),
        body: JSON.stringify(txSyncBody),
      },
    );
  } else {
    console.log('SKIP transaction sync write (SMOKE_TX_SYNC_BODY not set)');
  }

  if (taskCreateBody) {
    assert(isRecord(taskCreateBody), 'SMOKE_TASK_CREATE_BODY must be a JSON object');
    await checkJson(
      '/api/tasks',
      'task create',
      201,
      (body) => {
        assert(typeof body?.id === 'string', 'task create missing id');
        assert(typeof body?.title === 'string', 'task create missing title');
      },
      {
        method: 'POST',
        headers: makeMutationHeaders(),
        body: JSON.stringify(taskCreateBody),
      },
    );
  } else {
    console.log('SKIP task create (SMOKE_TASK_CREATE_BODY not set)');
  }

  if (hireBody) {
    assert(isRecord(hireBody), 'SMOKE_HIRE_BODY must be a JSON object');
    assert(typeof hireBody.agentId === 'string' && hireBody.agentId.length > 0, 'SMOKE_HIRE_BODY.agentId is required');
    await checkJson(
      `/api/agents/${hireBody.agentId}/hire`,
      'agent hire',
      201,
      (body) => {
        assert(body?.success === true, 'agent hire missing success=true');
        assert(typeof body?.transactionId === 'string', 'agent hire missing transactionId');
      },
      {
        method: 'POST',
        headers: makeMutationHeaders(),
        body: JSON.stringify({
          taskId: hireBody.taskId,
          txHash: hireBody.txHash,
        }),
      },
    );
  } else {
    console.log('SKIP agent hire (SMOKE_HIRE_BODY not set)');
  }

  if (resultTaskId) {
    const { res, body, contentType } = await request(`/api/tasks/${resultTaskId}/result`);
    assert(res.status === 200, `task result returned ${res.status}, expected 200`);
    assert(contentType.includes('application/json'), 'task result did not return JSON');
    assert((res.headers.get('cache-control') ?? '').includes('no-store'), 'task result is missing no-store caching');
    assert(typeof body?.summary === 'string', 'task result missing summary');
    assert(Array.isArray(body?.findings), 'task result missing findings');
    console.log('PASS task result');
  }
} else {
  await checkJson('/api/security/stats', 'security stats unauthorized', 401, (body) => {
    assert(body?.error === 'Unauthorized', 'security stats unauthorized response changed');
  });

  await checkJson('/api/wallet/stats', 'wallet stats unauthorized', 401, (body) => {
    assert(body?.error === 'Unauthorized', 'wallet stats unauthorized response changed');
  });
}

await checkJson('/api/cron/advance-tasks', 'cron advance unauthorized', 401, (body) => {
  assert(body?.error === 'Unauthorized', 'cron advance unauthorized response changed');
});

await checkJson('/api/cron/check-signer-balance', 'signer balance unauthorized', 401, (body) => {
  assert(body?.error === 'Unauthorized', 'signer balance unauthorized response changed');
});

if (cronSecret) {
  await checkJson(
    '/api/cron/advance-tasks',
    'cron advance',
    200,
    (body) => {
      assert(typeof body?.total === 'number', 'cron advance missing total');
      assert(typeof body?.advanced === 'number', 'cron advance missing advanced');
      assert(Array.isArray(body?.results), 'cron advance missing results');
    },
    { headers: makeHeaders({ authorization: `Bearer ${cronSecret}` }) },
  );

  await checkJson(
    '/api/cron/check-signer-balance',
    'signer balance',
    200,
    (body) => {
      assert(typeof body?.address === 'string', 'signer balance missing address');
      assert(typeof body?.balanceEth === 'string', 'signer balance missing balanceEth');
      assert(typeof body?.belowThreshold === 'boolean', 'signer balance missing belowThreshold');
    },
    { headers: makeHeaders({ authorization: `Bearer ${cronSecret}` }) },
  );
} else {
  console.log('SKIP cron advance (SMOKE_CRON_SECRET not set)');
}

await checkHtml('/privacy', 'privacy page');
await checkHtml('/terms', 'terms page');
await checkHtml('/support', 'support page');

console.log('Smoke checks passed');
