import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

// Persistência do token OAuth do Google (Drive + YouTube, mesmo consentimento) em Supabase —
// substitui o antigo driveTokensRepo em SQLite (lib/server/db.ts), que em produção na Vercel
// vivia em /tmp e se perdia a cada cold start. Linha única (id = 1): a instância é single-tenant,
// um só operador conecta uma conta Google (ver docs/META_INTEGRATION_SETUP.md).

export type GoogleDriveTokens = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
};

type GoogleDriveTokensRow = {
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  scope: string | null;
  token_type: string | null;
  expiry_date: number | null;
};

function throwIfError<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export const googleDriveTokensRepo = {
  async get(): Promise<GoogleDriveTokens | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("google_drive_tokens")
      .select("access_token_encrypted, refresh_token_encrypted, scope, token_type, expiry_date")
      .eq("id", 1)
      .maybeSingle();
    const row = throwIfError(data, error) as GoogleDriveTokensRow | null;
    if (!row) return null;
    return {
      access_token: decryptSecret(row.access_token_encrypted),
      refresh_token: row.refresh_token_encrypted ? decryptSecret(row.refresh_token_encrypted) : undefined,
      scope: row.scope ?? undefined,
      token_type: row.token_type ?? undefined,
      expiry_date: row.expiry_date ?? undefined,
    };
  },

  /** Faz merge com o token já salvo — a googleapis client às vezes só manda `access_token` +
   *  `expiry_date` novos num refresh, sem repetir o `refresh_token` original. */
  async set(tokens: GoogleDriveTokens): Promise<void> {
    const current = await googleDriveTokensRepo.get();
    const merged: GoogleDriveTokens = { ...current, ...tokens };
    if (!merged.access_token) return;
    const { error } = await getSupabaseAdmin().from("google_drive_tokens").upsert({
      id: 1,
      access_token_encrypted: encryptSecret(merged.access_token),
      refresh_token_encrypted: merged.refresh_token ? encryptSecret(merged.refresh_token) : null,
      scope: merged.scope ?? null,
      token_type: merged.token_type ?? null,
      expiry_date: merged.expiry_date ?? null,
      updated_at: new Date().toISOString(),
    });
    throwIfError(null, error);
  },

  async clear(): Promise<void> {
    const { error } = await getSupabaseAdmin().from("google_drive_tokens").delete().eq("id", 1);
    throwIfError(null, error);
  },
};
