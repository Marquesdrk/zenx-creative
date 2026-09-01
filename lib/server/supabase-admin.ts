import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase server-only com a service role key (bypassa RLS) — nunca importar este
// módulo de código de cliente. Usado tanto pela integração Meta (lib/server/meta/db.ts)
// quanto pelo upload de vídeos renderizados (lib/server/supabase-storage.ts).

const globalForSupabase = globalThis as unknown as { __zenxSupabaseAdmin?: SupabaseClient };

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient {
  if (globalForSupabase.__zenxSupabaseAdmin) return globalForSupabase.__zenxSupabaseAdmin;

  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não definidos — necessários para a integração Meta. " +
        "Configure em .env.local (veja .env.local.example) e rode supabase/migrations/0001_meta_integration.sql."
    );
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  globalForSupabase.__zenxSupabaseAdmin = client;
  return client;
}
