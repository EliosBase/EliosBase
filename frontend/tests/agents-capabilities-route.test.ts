import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAgentCapabilitiesManifest: vi.fn(),
}));

vi.mock('@/lib/x402', () => ({
  getAgentCapabilitiesManifest: mocks.getAgentCapabilitiesManifest,
}));

const { GET } = await import('@/app/api/agents/[id]/capabilities/route');

describe('GET /api/agents/[id]/capabilities', () => {
  it('returns the capabilities manifest with cache headers', async () => {
    mocks.getAgentCapabilitiesManifest.mockResolvedValue({
      agentId: 'ag-1',
      capabilities: [{ id: 'execute-task' }],
    });

    const response = await GET(new Request('https://eliosbase.test/api/agents/ag-1/capabilities') as never, {
      params: Promise.resolve({ id: 'ag-1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('public');
    await expect(response.json()).resolves.toEqual({
      agentId: 'ag-1',
      capabilities: [{ id: 'execute-task' }],
    });
  });

  it('returns 404 when the agent has no payable capabilities', async () => {
    mocks.getAgentCapabilitiesManifest.mockResolvedValue(null);

    const response = await GET(new Request('https://eliosbase.test/api/agents/ag-missing/capabilities') as never, {
      params: Promise.resolve({ id: 'ag-missing' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Agent not found' });
  });
});
