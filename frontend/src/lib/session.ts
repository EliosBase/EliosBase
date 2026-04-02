import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { readRequiredEnv } from '@/lib/env';

export interface SessionData {
  nonce?: string;
  userId?: string;
  walletAddress?: string;
  chainId?: number;
  role?: 'submitter' | 'operator' | 'admin';
  fid?: number;
  fcUsername?: string;
}

function getSessionOptions(): SessionOptions {
  return {
    password: readRequiredEnv('SESSION_SECRET', process.env.SESSION_SECRET),
    cookieName: 'eliosbase_session',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'none' as const,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 24 hours
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}
