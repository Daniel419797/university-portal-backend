import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from './logger';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL);
}

export function getSupabaseUrl(): string {
  return normalizeBaseUrl(requiredEnv('SUPABASE_URL'));
}

export function getSupabaseAnonKey(): string {
  return requiredEnv('SUPABASE_ANON_KEY');
}

export function getSupabaseServiceRoleKey(): string {
  return requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}

let _supabaseAdmin: SupabaseClient | null = null;
let _supabaseAnon: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin;
  _supabaseAdmin = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _supabaseAdmin;
}

export function supabaseAnon(): SupabaseClient {
  if (_supabaseAnon) return _supabaseAnon;
  _supabaseAnon = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _supabaseAnon;
}

export async function checkSupabaseConnection(): Promise<void> {
  if (!isSupabaseConfigured()) {
    logger.warn('Supabase not configured (SUPABASE_URL missing)');
    return;
  }

  // Lightweight check: call auth settings endpoint via client (no DB table required).
  // If this passes, DNS/outbound network + project URL are valid.
  const url = `${getSupabaseUrl()}/auth/v1/settings`;

  const res = await fetch(url, {
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${getSupabaseAnonKey()}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase connectivity check failed (${res.status}): ${text}`);
  }
}
