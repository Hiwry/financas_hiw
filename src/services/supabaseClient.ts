import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env';

const supabaseUrl = getEnv('VITE_SUPABASE_URL', 'SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

let ensureAuthPromise: Promise<string | null> | null = null;

export const ensureSupabaseUserId = async (): Promise<string | null> => {
  if (!isSupabaseConfigured || !supabase) return null;

  if (ensureAuthPromise) return ensureAuthPromise;

  ensureAuthPromise = (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('Supabase getSession failed:', sessionError.message);
      return null;
    }

    return sessionData?.session?.user?.id || null;
  })();

  try {
    return await ensureAuthPromise;
  } finally {
    ensureAuthPromise = null;
  }
};
