const baseUrl = process.env.SMOKE_BASE_URL;
const cronSecret = process.env.SMOKE_CRON_SECRET;
const sessionCookie = process.env.SMOKE_SESSION_COOKIE;
const resultTaskId = process.env.SMOKE_TASK_ID;

if (!baseUrl) {
  console.error('SMOKE_BASE_URL is required');
  process.exit(1);
}

const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

function makeHeaders(extra = {}) {
  const headers = new Headers(extra);
  if (sessionCookie) {
    headers.set('cookie', `eliosbase_session=${sessionCookie}`);
  }
  return headers;
}

async function request(path, init = {}) {
  const res = await fetch(`${normalizedBaseUrl}${path}`, {
    ...init,
    headers: makeHeaders(init.headers),
  });
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

async function checkHtml(path, label) {
  const { res, body } = await request(path);
  assert(res.ok, `${label} returned ${res.status}`);
  assert(typeof body === 'string' && body.includes('<html'), `${label} did not return HTML`);
  console.log(`PASS ${label}`);
}

async function checkJson(path, label, expectedStatus, validate, init = {}) {
  const { res, body, contentType } = await request(path, init);
  assert(res.status === expectedStatus, `${label} returned ${res.status}, expected ${expectedStatus}`);
  assert(contentType.includes('application/json'), `${label} did not return JSON`);
  validate(body);
  console.log(`PASS ${label}`);
}

await checkHtml('/', 'homepage');

await checkJson('/api/auth/session', 'auth session', 200, (body) => {
  assert(typeof body?.authenticated === 'boolean', 'auth session missing authenticated flag');
});

await checkJson('/api/agents', 'agents listing', 200, (body) => {
  assert(Array.isArray(body), 'agents listing is not an array');
});

await checkJson('/api/tasks', 'tasks listing', 200, (body) => {
  assert(Array.isArray(body), 'tasks listing is not an array');
});

await checkJson('/api/activity', 'activity feed', 200, (body) => {
  assert(Array.isArray(body), 'activity feed is not an array');
});

await checkJson('/api/stats', 'dashboard stats', 200, (body) => {
  assert(typeof body?.activeAgents === 'number', 'dashboard stats missing activeAgents');
  assert(typeof body?.activeTasks === 'number', 'dashboard stats missing activeTasks');
  assert(typeof body?.zkProofs === 'number', 'dashboard stats missing zkProofs');
});

if (sessionCookie) {
  await checkJson('/api/security/stats', 'security stats', 200, (body) => {
    assert(typeof body?.threatsBlocked === 'number', 'security stats missing threatsBlocked');
    assert(typeof body?.guardrailsActive === 'number', 'security stats missing guardrailsActive');
  });

  await checkJson('/api/wallet/stats', 'wallet stats', 200, (body) => {
    assert(typeof body?.balance === 'string', 'wallet stats missing balance');
    assert(typeof body?.inEscrow === 'string', 'wallet stats missing inEscrow');
  });

  if (resultTaskId) {
    await checkJson(`/api/tasks/${resultTaskId}/result`, 'task result', 200, (body) => {
      assert(typeof body?.summary === 'string', 'task result missing summary');
      assert(Array.isArray(body?.findings), 'task result missing findings');
    });
  }
} else {
  await checkJson('/api/security/stats', 'security stats unauthorized', 401, (body) => {
    assert(body?.error === 'Unauthorized', 'security stats unauthorized response changed');
  });

  await checkJson('/api/wallet/stats', 'wallet stats unauthorized', 401, (body) => {
    assert(body?.error === 'Unauthorized', 'wallet stats unauthorized response changed');
  });
}

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
} else {
  console.log('SKIP cron advance (SMOKE_CRON_SECRET not set)');
}

console.log('Smoke checks passed');
