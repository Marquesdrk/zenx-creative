import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

// Chave de API da OpenAI Platform (platform.openai.com) — diferente da assinatura ChatGPT
// Plus, é o jeito real de um app de terceiros chamar os modelos da OpenAI em nome do usuário.
// Linha única (id = 1): instância single-tenant, mesmo padrão de lib/server/google/drive-tokens-db.ts.

function throwIfError<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export const openAiCredentialsRepo = {
  async get(): Promise<string | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("openai_credentials")
      .select("api_key_encrypted")
      .eq("id", 1)
      .maybeSingle();
    const row = throwIfError(data, error) as { api_key_encrypted: string } | null;
    return row ? decryptSecret(row.api_key_encrypted) : null;
  },

  async set(apiKey: string): Promise<void> {
    const { error } = await getSupabaseAdmin().from("openai_credentials").upsert({
      id: 1,
      api_key_encrypted: encryptSecret(apiKey),
      updated_at: new Date().toISOString(),
    });
    throwIfError(null, error);
  },

  async clear(): Promise<void> {
    const { error } = await getSupabaseAdmin().from("openai_credentials").delete().eq("id", 1);
    throwIfError(null, error);
  },
};
