import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAgentPassport: vi.fn(),
}));

vi.mock('@/lib/web4Graph', () => ({
  getAgentPassport: mocks.getAgentPassport,
}));

const { GET } = await import('@/app/api/agents/[id]/passport/route');

describe('GET /api/agents/[id]/passport', () => {
  it('returns the public passport with cache headers', async () => {
    mocks.getAgentPassport.mockResolvedValue({
      identity: { id: 'ag-1' },
    });

    const response = await GET(new Request('https://eliosbase.test/api/agents/ag-1/passport') as never, {
      params: Promise.resolve({ id: 'ag-1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('public');
    await expect(response.json()).resolves.toEqual({
      identity: { id: 'ag-1' },
    });
  });

  it('returns 404 when the passport does not exist', async () => {
    mocks.getAgentPassport.mockResolvedValue(null);

    const response = await GET(new Request('https://eliosbase.test/api/agents/ag-missing/passport') as never, {
      params: Promise.resolve({ id: 'ag-missing' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Agent not found' });
  });
});
