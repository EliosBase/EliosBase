import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPublicActivityFeed: vi.fn(),
}));

vi.mock('@/lib/web4Graph', () => ({
  getPublicActivityFeed: mocks.getPublicActivityFeed,
}));

const { GET } = await import('@/app/api/activity/route');

describe('GET /api/activity', () => {
  it('returns graph events and emits the next cursor header', async () => {
    mocks.getPublicActivityFeed.mockResolvedValue({
      items: [
        {
          id: 'ev-1',
          type: 'task',
          message: 'Task completed',
          timestamp: '1 min ago',
          source: 'activity',
          occurredAt: '2026-04-01T00:00:00.000Z',
          eventType: 'task.completed',
          entityType: 'task',
          entityId: 'task-1',
        },
      ],
      nextCursor: 'cursor-1',
    });

    const response = await GET(new NextRequest('https://eliosbase.test/api/activity?entityType=task&limit=1'));

    expect(mocks.getPublicActivityFeed).toHaveBeenCalledWith({
      limit: 1,
      cursor: null,
      entityType: 'task',
      entityId: null,
      eventType: null,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Activity-Next-Cursor')).toBe('cursor-1');
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ eventType: 'task.completed' }),
    ]);
  });
});
