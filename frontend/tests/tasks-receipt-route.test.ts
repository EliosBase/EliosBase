import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTaskReceipt: vi.fn(),
}));

vi.mock('@/lib/web4Graph', () => ({
  getTaskReceipt: mocks.getTaskReceipt,
}));

const { GET } = await import('@/app/api/tasks/[id]/receipt/route');

describe('GET /api/tasks/[id]/receipt', () => {
  it('returns the public receipt with cache headers', async () => {
    mocks.getTaskReceipt.mockResolvedValue({
      identity: { id: 'task-1' },
    });

    const response = await GET(new Request('https://eliosbase.test/api/tasks/task-1/receipt') as never, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('public');
    await expect(response.json()).resolves.toEqual({
      identity: { id: 'task-1' },
    });
  });

  it('returns 404 when the receipt does not exist', async () => {
    mocks.getTaskReceipt.mockResolvedValue(null);

    const response = await GET(new Request('https://eliosbase.test/api/tasks/task-missing/receipt') as never, {
      params: Promise.resolve({ id: 'task-missing' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Task not found' });
  });
});
