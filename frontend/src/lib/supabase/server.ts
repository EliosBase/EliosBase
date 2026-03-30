import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { readRequiredEnv } from '@/lib/env';

function createServerClient(keyName: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY') {
  return createSupabaseClient(
    readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    readRequiredEnv(keyName, process.env[keyName]),
  );
}

export function createPublicServerClient() {
  return createServerClient('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function createUserServerClient() {
  return createServerClient('SUPABASE_SERVICE_ROLE_KEY');
}

export function createServiceClient() {
  return createServerClient('SUPABASE_SERVICE_ROLE_KEY');
}
