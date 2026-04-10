import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { MAX_REQUEST_BODY_BYTES, middleware } from '@/middleware';

/**
 * Middleware body-size limit tests.
 *
 * The edge middleware rejects any API request with Content-Length above
 * MAX_REQUEST_BODY_BYTES (1 MiB) with a 413 before the handler runs, so
 * oversized payloads never hit Supabase or Anthropic.
 */

function makeApiRequest(params: {
  path?: string;
  method?: string;
  contentLength?: number | string | null;
  cookie?: string;
}) {
  const headers: Record<string, string> = {};
  if (params.contentLength !== null && params.contentLength !== undefined) {
    headers['content-length'] = String(params.contentLength);
  }
  if (params.cookie) {
    headers['cookie'] = params.cookie;
  }
  return new NextRequest(`https://eliosbase.test${params.path ?? '/api/tasks'}`, {
    method: params.method ?? 'POST',
    headers,
  });
}

describe('middleware — 1MB body limit on /api/*', () => {
  it('rejects POST with content-length above the limit with 413', async () => {
    const res = middleware(
      makeApiRequest({ contentLength: MAX_REQUEST_BODY_BYTES + 1 }),
    );
    expect(res?.status).toBe(413);
    const json = await res!.json();
    expect(json.error).toBe('Request body too large');
    expect(json.maxBytes).toBe(MAX_REQUEST_BODY_BYTES);
    expect(json.receivedBytes).toBe(MAX_REQUEST_BODY_BYTES + 1);
  });

  it('allows POST with content-length at exactly the limit', async () => {
    const res = middleware(
      makeApiRequest({ contentLength: MAX_REQUEST_BODY_BYTES }),
    );
    // middleware falls through to NextResponse.next() — non-413 status
    expect(res?.status).not.toBe(413);
  });

  it('allows POST well below the limit', async () => {
    const res = middleware(makeApiRequest({ contentLength: 1024 }));
    expect(res?.status).not.toBe(413);
  });

  it('allows POST with no content-length header', async () => {
    const res = middleware(makeApiRequest({ contentLength: null }));
    expect(res?.status).not.toBe(413);
  });

  it('ignores GET requests entirely (no body)', async () => {
    const res = middleware(
      makeApiRequest({
        method: 'GET',
        contentLength: MAX_REQUEST_BODY_BYTES + 9999,
      }),
    );
    expect(res?.status).not.toBe(413);
  });

  it('rejects oversized PUT', async () => {
    const res = middleware(
      makeApiRequest({ method: 'PUT', contentLength: MAX_REQUEST_BODY_BYTES + 1 }),
    );
    expect(res?.status).toBe(413);
  });

  it('rejects oversized PATCH', async () => {
    const res = middleware(
      makeApiRequest({ method: 'PATCH', contentLength: MAX_REQUEST_BODY_BYTES + 1 }),
    );
    expect(res?.status).toBe(413);
  });

  it('rejects oversized DELETE', async () => {
    const res = middleware(
      makeApiRequest({ method: 'DELETE', contentLength: MAX_REQUEST_BODY_BYTES + 1 }),
    );
    expect(res?.status).toBe(413);
  });

  it('treats a non-numeric content-length as absent (allows)', async () => {
    const res = middleware(
      makeApiRequest({ contentLength: 'not-a-number' }),
    );
    expect(res?.status).not.toBe(413);
  });

  it('does not apply the limit to non-API routes', async () => {
    const res = middleware(
      makeApiRequest({
        path: '/dashboard',
        contentLength: MAX_REQUEST_BODY_BYTES + 1,
      }),
    );
    expect(res?.status).not.toBe(413);
  });

  it('still blocks /api/admin without a session cookie (body-limit path does not bypass auth)', async () => {
    const res = middleware(
      makeApiRequest({
        path: '/api/admin/agents/ag-1/suspend',
        contentLength: 256,
      }),
    );
    expect(res?.status).toBe(401);
  });

  it('prefers 413 over 401 when an oversized body is sent to /api/admin', async () => {
    const res = middleware(
      makeApiRequest({
        path: '/api/admin/agents/ag-1/suspend',
        contentLength: MAX_REQUEST_BODY_BYTES + 1,
      }),
    );
    expect(res?.status).toBe(413);
  });
});
