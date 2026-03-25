import { type Page, type Route } from '@playwright/test';

type SessionData = {
  authenticated: boolean;
  userId?: string;
  walletAddress?: string;
  chainId?: number;
  role?: 'submitter' | 'operator' | 'admin';
};

type JsonRecord = Record<string, unknown>;

interface MockAppOptions {
  session?: SessionData;
  tasks?: JsonRecord[];
  taskResult?: JsonRecord | null;
  agents?: JsonRecord[];
  securityStats?: JsonRecord;
  alerts?: JsonRecord[];
  guardrails?: JsonRecord[];
  auditLog?: JsonRecord[];
  onTaskCreate?: (body: JsonRecord) => void;
  onAgentRegister?: (body: JsonRecord) => void;
}

const defaultSecurityStats = {
  threatsBlocked: 128,
  threatsBlockedTrend: '+12%',
  guardrailsActive: 4,
  guardrailsTotal: 5,
  guardrailsTrend: '+1',
  proofsVerified: 98,
  proofsTrend: '+8%',
  uptime: '99.98%',
  uptimeTrend: '+0.02%',
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseBody(route: Route): JsonRecord {
  const raw = route.request().postData();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as JsonRecord;
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function mockAppApi(page: Page, options: MockAppOptions = {}) {
  const session = options.session ?? { authenticated: false };
  const tasks = clone(options.tasks ?? []);
  const agents = clone(options.agents ?? []);
  const taskResult = options.taskResult ?? null;
  const securityStats = clone(options.securityStats ?? defaultSecurityStats);
  let alerts = clone(options.alerts ?? []);
  let guardrails = clone(options.guardrails ?? []);
  let auditLog = clone(options.auditLog ?? []);

  await page.route('**/api/auth/session', (route) => fulfillJson(route, session));

  await page.route('**/api/tasks/*/result', (route) => {
    if (!taskResult) {
      return fulfillJson(route, { error: 'Task result not found' }, 404);
    }

    return fulfillJson(route, taskResult);
  });

  await page.route('**/api/tasks', (route) => {
    if (route.request().method() === 'POST') {
      const body = parseBody(route);
      options.onTaskCreate?.(body);

      const createdTask = {
        id: 'task-new',
        title: String(body.title ?? ''),
        description: String(body.description ?? ''),
        status: 'active',
        currentStep: 'Submitted',
        assignedAgent: 'Unassigned',
        reward: String(body.reward ?? ''),
        submittedAt: '2026-03-24T12:00:00.000Z',
        submitterId: session.userId ?? 'user-1',
      };

      tasks.unshift(createdTask);
      return fulfillJson(route, createdTask, 201);
    }

    return fulfillJson(route, tasks);
  });

  await page.route('**/api/agents/register', (route) => {
    const body = parseBody(route);
    options.onAgentRegister?.(body);

    const createdAgent = {
      id: 'agent-new',
      ownerId: session.userId ?? 'user-1',
      reputation: 100,
      tasksCompleted: 0,
      status: 'online',
      ...body,
    };

    agents.unshift(createdAgent);
    return fulfillJson(route, createdAgent, 201);
  });

  await page.route(/\/api\/agents(?:\?.*)?$/, (route) => fulfillJson(route, agents));

  await page.route('**/api/security/stats', (route) => fulfillJson(route, securityStats));

  await page.route('**/api/security/alerts/*', (route) => {
    const alertId = route.request().url().split('/').at(-1);
    const body = parseBody(route);

    alerts = alerts.map((alert) => {
      if (alert.id !== alertId) {
        return alert;
      }

      return {
        ...alert,
        resolved: body.resolved === true,
      };
    });

    const updatedAlert = alerts.find((alert) => alert.id === alertId);
    return fulfillJson(route, updatedAlert ?? { error: 'Alert not found' }, updatedAlert ? 200 : 404);
  });

  await page.route('**/api/security/alerts', (route) => fulfillJson(route, alerts));

  await page.route('**/api/security/guardrails/*', (route) => {
    const guardrailId = route.request().url().split('/').at(-1);
    const body = parseBody(route);

    guardrails = guardrails.map((guardrail) => {
      if (guardrail.id !== guardrailId) {
        return guardrail;
      }

      return {
        ...guardrail,
        status: body.status,
      };
    });

    const updatedGuardrail = guardrails.find((guardrail) => guardrail.id === guardrailId);
    if (updatedGuardrail) {
      auditLog = [
        {
          timestamp: '12:40:00',
          action: `GUARDRAIL_${String(body.status).toUpperCase()}`,
          actor: 'operator',
          target: updatedGuardrail.name,
          result: 'ALLOW',
        },
        ...auditLog,
      ];
    }

    return fulfillJson(route, updatedGuardrail ?? { error: 'Guardrail not found' }, updatedGuardrail ? 200 : 404);
  });

  await page.route('**/api/security/guardrails', (route) => fulfillJson(route, guardrails));
  await page.route('**/api/security/audit-log', (route) => fulfillJson(route, auditLog));
}
