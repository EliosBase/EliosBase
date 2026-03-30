import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateOrigin } from '@/lib/csrf';

describe('validateOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed in production when NEXT_PUBLIC_SITE_URL is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const response = validateOrigin(new NextRequest('https://eliosbase.test/api/tasks', {
      method: 'POST',
      headers: { origin: 'https://eliosbase.test' },
    }));

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({ error: 'NEXT_PUBLIC_SITE_URL not configured' });
  });
});
