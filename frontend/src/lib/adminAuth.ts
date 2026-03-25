import { NextRequest, NextResponse } from 'next/server';
import { getSession, type SessionData } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';

/**
 * Require admin or operator role for a mutation request.
 * Validates CSRF origin, session, and role.
 */
export async function requireAdminOrOperator(
  req: NextRequest,
  { skipCsrf }: { skipCsrf?: boolean } = {}
): Promise<
  { session: SessionData & { userId: string; role: string }; error: null } |
  { session: null; error: NextResponse }
> {
  if (!skipCsrf) {
    const csrfError = validateOrigin(req);
    if (csrfError) return { session: null, error: csrfError };
  }

  const session = await getSession();

  if (!session.userId) {
    return { session: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (session.role !== 'admin' && session.role !== 'operator') {
    return { session: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { session: session as SessionData & { userId: string; role: string }, error: null };
}
