import { AppState } from '../types';
import { ensureSupabaseUserId, isSupabaseConfigured, supabase } from './supabaseClient';
import { getEnv } from './env';

const APP_STATE_TABLE = 'app_state';
const APP_STATE_ID = getEnv('VITE_SUPABASE_APP_STATE_ID', 'SUPABASE_APP_STATE_ID') || 'hiwrys-project';

type SaveStatus = 'saved' | 'skipped' | 'conflict' | 'error';

type RemoteRow = {
  id: string;
  user_id: string;
  payload: unknown;
  version: number | null;
  updated_at: string | null;
};

let cachedRemoteVersion = 0;

const isValidAppState = (value: unknown): value is AppState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppState>;
  return Array.isArray(candidate.transactions) && Array.isArray(candidate.categories) && Array.isArray(candidate.accounts);
};

const normalizeVersion = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.floor(numeric);
};

const readCurrentRemoteRow = async (userId: string): Promise<RemoteRow | null> => {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(APP_STATE_TABLE)
    .select('id,user_id,payload,version,updated_at')
    .eq('id', APP_STATE_ID)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Supabase read failed:', error.message);
    return null;
  }

  return (data as RemoteRow | null) || null;
};

export const loadRemoteAppState = async (): Promise<AppState | null> => {
  if (!isSupabaseConfigured || !supabase) return null;

  const userId = await ensureSupabaseUserId();
  if (!userId) return null;

  const row = await readCurrentRemoteRow(userId);
  if (!row?.payload || !isValidAppState(row.payload)) return null;

  cachedRemoteVersion = normalizeVersion(row.version);
  return row.payload;
};

export const saveRemoteAppState = async (state: AppState): Promise<SaveStatus> => {
  if (!isSupabaseConfigured || !supabase) return 'skipped';

  const userId = await ensureSupabaseUserId();
  if (!userId) return 'skipped';

  const latestRow = await readCurrentRemoteRow(userId);
  const latestVersion = normalizeVersion(latestRow?.version);

  if (latestVersion > cachedRemoteVersion) {
    console.warn('Supabase save skipped due to version conflict. Reloading from remote is recommended.');
    cachedRemoteVersion = latestVersion;
    return 'conflict';
  }

  const nextVersion = latestVersion + 1;
  const { error } = await supabase.from(APP_STATE_TABLE).upsert(
    {
      user_id: userId,
      id: APP_STATE_ID,
      payload: state,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,id',
    }
  );

  if (error) {
    console.error('Supabase save failed:', error.message);
    return 'error';
  }

  cachedRemoteVersion = nextVersion;
  return 'saved';
};
