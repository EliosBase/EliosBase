import { createBrowserClient } from '@supabase/ssr';
import { readRequiredEnv } from '@/lib/env';

export function createClient() {
  return createBrowserClient(
    readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    readRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
