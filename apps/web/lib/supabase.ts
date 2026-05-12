import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let _client: SupabaseClient | null = null;

export function createServerClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _client;
}
