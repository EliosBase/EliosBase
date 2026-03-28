import { NextRequest, NextResponse } from 'next/server';
import { getSession, type SessionData } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';

type PrivilegedRole = 'operator' | 'admin';
type PrivilegedSession = SessionData & { userId: string; role: PrivilegedRole };

function hasPrivilegedRole(role: SessionData['role']): role is PrivilegedRole {
  return role === 'operator' || role === 'admin';
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function requireAdminOrOperatorSession(): Promise<
  { session: PrivilegedSession; error: null } |
  { session: null; error: NextResponse }
> {
  const session = await getSession();

  if (!session.userId) {
    return { session: null, error: unauthorized() };
  }

  if (!hasPrivilegedRole(session.role)) {
    return { session: null, error: forbidden() };
  }

  return { session: session as PrivilegedSession, error: null };
}

/**
 * Require admin or operator role for a mutation request.
 * Validates CSRF origin, session, and role.
 */
export async function requireAdminOrOperator(
  req: NextRequest,
  { skipCsrf }: { skipCsrf?: boolean } = {}
): Promise<
  { session: PrivilegedSession; error: null } |
  { session: null; error: NextResponse }
> {
  if (!skipCsrf) {
    const csrfError = validateOrigin(req);
    if (csrfError) return { session: null, error: csrfError };
  }

  return requireAdminOrOperatorSession();
}
