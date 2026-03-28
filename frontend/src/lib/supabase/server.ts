import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { readRequiredEnv } from '@/lib/env';

export function createServiceClient() {
  return createSupabaseClient(
    readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}
