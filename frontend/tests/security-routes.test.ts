import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  createSecurityAlert: vi.fn(),
  getSession: vi.fn(),
  logActivity: vi.fn(),
  logAudit: vi.fn(),
  validateOrigin: vi.fn(() => null),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/lib/audit', () => ({
  createSecurityAlert: mocks.createSecurityAlert,
  logActivity: mocks.logActivity,
  logAudit: mocks.logAudit,
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: mocks.validateOrigin,
}));

const { GET: getStats } = await import('@/app/api/security/stats/route');
const { GET: getAlerts, POST: postAlerts } = await import('@/app/api/security/alerts/route');
const { GET: getAuditLog } = await import('@/app/api/security/audit-log/route');
const { GET: getGuardrails } = await import('@/app/api/security/guardrails/route');
const { PATCH: patchAlert } = await import('@/app/api/security/alerts/[id]/route');
const { PATCH: patchGuardrail } = await import('@/app/api/security/guardrails/[id]/route');

function makeJsonRequest(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  return new NextRequest(`https://eliosbase.test${path}`, {
    method,
    headers: { origin: 'https://eliosbase.test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('security route permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateOrigin.mockReturnValue(null);
  });

  it('returns 401 for stats without a session', async () => {
    mocks.getSession.mockResolvedValue({});

    const response = await getStats();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 for submitters on privileged read endpoints', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', role: 'submitter' });

    const [statsResponse, alertsResponse, auditResponse, guardrailsResponse] = await Promise.all([
      getStats(),
      getAlerts(),
      getAuditLog(),
      getGuardrails(),
    ]);

    expect(statsResponse.status).toBe(403);
    expect(alertsResponse.status).toBe(403);
    expect(auditResponse.status).toBe(403);
    expect(guardrailsResponse.status).toBe(403);
  });

  it('returns 403 for submitters on privileged mutation endpoints', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', role: 'submitter' });

    const [createAlertResponse, resolveAlertResponse, toggleGuardrailResponse] = await Promise.all([
      postAlerts(makeJsonRequest('/api/security/alerts', 'POST', {
        severity: 'low',
        title: 'Alert',
        description: 'Details',
        source: 'test',
      })),
      patchAlert(
        makeJsonRequest('/api/security/alerts/alert-1', 'PATCH', { resolved: true }),
        { params: Promise.resolve({ id: 'alert-1' }) },
      ),
      patchGuardrail(
        makeJsonRequest('/api/security/guardrails/gr-1', 'PATCH', { status: 'paused' }),
        { params: Promise.resolve({ id: 'gr-1' }) },
      ),
    ]);

    expect(createAlertResponse.status).toBe(403);
    expect(resolveAlertResponse.status).toBe(403);
    expect(toggleGuardrailResponse.status).toBe(403);
  });

  it('allows operators to read guardrails', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', role: 'operator' });
    mocks.createServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(async () => ({
            data: [
              {
                id: 'gr-1',
                name: 'Execution rate limiter',
                description: 'Caps retries.',
                status: 'active',
                triggered_count: 12,
              },
            ],
            error: null,
          })),
        })),
      })),
    });

    const response = await getGuardrails();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: 'gr-1',
        name: 'Execution rate limiter',
        description: 'Caps retries.',
        status: 'active',
        triggeredCount: 12,
      },
    ]);
  });
});
