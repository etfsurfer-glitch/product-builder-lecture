// Supabase 클라이언트 + 세션 관리
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { fetchPublicConfig } from './api';

let _client: SupabaseClient | null = null;
let _initPromise: Promise<SupabaseClient> | null = null;

export async function getSupabase(): Promise<SupabaseClient> {
  if (_client) return _client;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const cfg = await fetchPublicConfig();
    _client = createClient(cfg.supabase_url, cfg.supabase_anon_key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'nfind-auth',
      },
    });
    return _client;
  })();
  return _initPromise;
}

export async function getCurrentSession(): Promise<Session | null> {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

export async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
}

export function goToLanding() {
  location.href = '/';
}
