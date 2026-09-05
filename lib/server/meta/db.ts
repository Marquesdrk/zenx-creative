import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type {
  MetaIntegrationLogEntry,
  MetaIntegrationStep,
  PublicationLog,
  PublicationLogAction,
  PublicationLogStatus,
  ScheduledPost,
  ScheduledPostAccount,
  ScheduledPostAccountStatus,
  ScheduledPostStatus,
  ScheduledPostVideoSource,
  SocialAccount,
  SocialAccountStatus,
  SocialPlatform,
} from "@/lib/server/meta/types";

// Persistência da integração Meta em Supabase (Postgres) — ver
// supabase/migrations/0001_meta_integration.sql para o schema e
// docs/META_INTEGRATION_SETUP.md para o desenho geral. Todas as tabelas deste projeto que
// NÃO são da integração Meta (perfis/templates/lotes do editor) continuam em SQLite local
// (lib/server/db.ts) — a migração aqui é escopada só ao que este arquivo cobre.

function throwIfError<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

// --- social_accounts -----------------------------------------------------------------------

type SocialAccountRow = {
  id: string;
  user_id: string | null;
  project_id: string | null;
  platform: string;
  platform_account_id: string;
  page_id: string | null;
  instagram_user_id: string | null;
  account_name: string;
  username: string | null;
  profile_picture_url: string | null;
  access_token_encrypted: string;
  token_expires_at: string | null;
  status: string;
  meta_user_id: string | null;
  permissions: string[] | null;
  last_checked_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function socialAccountFromRow(row: SocialAccountRow): SocialAccount {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    platform: row.platform as SocialPlatform,
    platformAccountId: row.platform_account_id,
    pageId: row.page_id,
    instagramUserId: row.instagram_user_id,
    accountName: row.account_name,
    username: row.username,
    profilePictureUrl: row.profile_picture_url,
    status: row.status as SocialAccountStatus,
    metaUserId: row.meta_user_id,
    permissions: row.permissions ?? [],
    tokenExpiresAt: row.token_expires_at,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SOCIAL_ACCOUNT_PUBLIC_COLUMNS =
  "id, user_id, project_id, platform, platform_account_id, page_id, instagram_user_id, account_name, username, profile_picture_url, token_expires_at, status, meta_user_id, permissions, last_checked_at, last_error, metadata, created_at, updated_at";

/** access_token_encrypted nunca é selecionado por esses métodos — quem precisa do token
 *  decodificado usa socialAccountsRepo.getAccessToken(id) explicitamente. */
export const socialAccountsRepo = {
  async list(): Promise<SocialAccount[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("social_accounts")
      .select(SOCIAL_ACCOUNT_PUBLIC_COLUMNS)
      .order("platform", { ascending: true })
      .order("account_name", { ascending: true });
    return throwIfError(data ?? [], error).map((row) => socialAccountFromRow(row as unknown as SocialAccountRow));
  },

  async get(id: string): Promise<SocialAccount | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("social_accounts")
      .select(SOCIAL_ACCOUNT_PUBLIC_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    const row = throwIfError(data, error);
    return row ? socialAccountFromRow(row as unknown as SocialAccountRow) : null;
  },

  async findByPlatformAccountId(platform: SocialPlatform, platformAccountId: string): Promise<SocialAccount | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("social_accounts")
      .select(SOCIAL_ACCOUNT_PUBLIC_COLUMNS)
      .eq("platform", platform)
      .eq("platform_account_id", platformAccountId)
      .maybeSingle();
    const row = throwIfError(data, error);
    return row ? socialAccountFromRow(row as unknown as SocialAccountRow) : null;
  },

  /** Token decodificado — só para uso interno de publicação/validação, nunca serializado
   *  numa resposta HTTP. */
  async getAccessToken(id: string): Promise<string | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("social_accounts")
      .select("access_token_encrypted")
      .eq("id", id)
      .maybeSingle();
    const row = throwIfError(data, error) as { access_token_encrypted: string } | null;
    if (!row?.access_token_encrypted) return null;
    return decryptSecret(row.access_token_encrypted);
  },

  /** Cria a conta, ou (se já existir uma com o mesmo platform+platform_account_id — ex.:
   *  reconexão) atualiza o token e os metadados e volta o status para "connected". Nunca cria
   *  colunas por conta — cada conexão é sempre uma linha nova e independente. */
  async upsertFromConnection(input: {
    userId?: string | null;
    projectId?: string | null;
    platform: SocialPlatform;
    platformAccountId: string;
    pageId: string | null;
    instagramUserId: string | null;
    accountName: string;
    username: string | null;
    profilePictureUrl: string | null;
    accessToken: string;
    tokenExpiresAt: string | null;
    metaUserId: string | null;
    permissions?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<SocialAccount> {
    const now = new Date().toISOString();
    const encrypted = encryptSecret(input.accessToken);
    const existing = await socialAccountsRepo.findByPlatformAccountId(input.platform, input.platformAccountId);

    const payload = {
      user_id: input.userId ?? null,
      project_id: input.projectId ?? null,
      platform: input.platform,
      platform_account_id: input.platformAccountId,
      page_id: input.pageId,
      instagram_user_id: input.instagramUserId,
      account_name: input.accountName,
      username: input.username,
      profile_picture_url: input.profilePictureUrl,
      access_token_encrypted: encrypted,
      token_expires_at: input.tokenExpiresAt,
      status: "connected",
      meta_user_id: input.metaUserId,
      permissions: input.permissions ?? [],
      last_checked_at: now,
      last_error: null,
      metadata: input.metadata ?? {},
      updated_at: now,
    };

    if (existing) {
      const { error } = await getSupabaseAdmin().from("social_accounts").update(payload).eq("id", existing.id);
      throwIfError(null, error);
      return (await socialAccountsRepo.get(existing.id))!;
    }

    const { data, error } = await getSupabaseAdmin()
      .from("social_accounts")
      .insert({ ...payload, created_at: now })
      .select(SOCIAL_ACCOUNT_PUBLIC_COLUMNS)
      .single();
    return socialAccountFromRow(throwIfError(data, error) as unknown as SocialAccountRow);
  },

  async updateStatus(
    id: string,
    status: SocialAccountStatus,
    patch?: { lastError?: string | null; lastCheckedAt?: string; permissions?: string[] }
  ): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await getSupabaseAdmin()
      .from("social_accounts")
      .update({
        status,
        last_error: patch?.lastError ?? null,
        last_checked_at: patch?.lastCheckedAt ?? now,
        updated_at: now,
        ...(patch?.permissions ? { permissions: patch.permissions } : {}),
      })
      .eq("id", id);
    throwIfError(null, error);
  },

  /** "Desconectar": revoga localmente e apaga o token (não recuperável a partir daqui) — mas
   *  preserva a linha e o histórico de publicações associado a ela para auditoria. Não afeta
   *  nenhuma outra conta. Reconectar (via OAuth de novo, escolhendo o mesmo ativo) cria um
   *  token novo e volta o status para "connected". */
  async disconnect(id: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await getSupabaseAdmin()
      .from("social_accounts")
      .update({ status: "revoked", access_token_encrypted: "", updated_at: now })
      .eq("id", id);
    throwIfError(null, error);
  },
};

// --- scheduled_posts / scheduled_post_accounts ----------------------------------------------

type ScheduledPostRow = {
  id: string;
  user_id: string | null;
  video_url: string | null;
  video_source: string;
  drive_file_id: string | null;
  drive_file_name: string | null;
  caption: string;
  scheduled_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function scheduledPostFromRow(row: ScheduledPostRow): ScheduledPost {
  return {
    id: row.id,
    userId: row.user_id,
    videoUrl: row.video_url,
    videoSource: row.video_source as ScheduledPostVideoSource,
    driveFileId: row.drive_file_id,
    driveFileName: row.drive_file_name,
    caption: row.caption,
    scheduledAt: row.scheduled_at,
    status: row.status as ScheduledPostStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const scheduledPostsRepo = {
  async list(): Promise<ScheduledPost[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("scheduled_posts")
      .select("*")
      .order("created_at", { ascending: false });
    return throwIfError(data ?? [], error).map((row) => scheduledPostFromRow(row as ScheduledPostRow));
  },

  async get(id: string): Promise<ScheduledPost | null> {
    const { data, error } = await getSupabaseAdmin().from("scheduled_posts").select("*").eq("id", id).maybeSingle();
    const row = throwIfError(data, error);
    return row ? scheduledPostFromRow(row as ScheduledPostRow) : null;
  },

  async create(post: ScheduledPost): Promise<void> {
    const { error } = await getSupabaseAdmin().from("scheduled_posts").insert({
      id: post.id,
      user_id: post.userId,
      video_url: post.videoUrl,
      video_source: post.videoSource,
      drive_file_id: post.driveFileId,
      drive_file_name: post.driveFileName,
      caption: post.caption,
      scheduled_at: post.scheduledAt,
      status: post.status,
      created_at: post.createdAt,
      updated_at: post.updatedAt,
    });
    throwIfError(null, error);
  },

  async updateStatus(id: string, status: ScheduledPostStatus): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("scheduled_posts")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    throwIfError(null, error);
  },

  /** Reagenda um post ainda não processado — o scheduler (listDue) lê `scheduled_at` direto
   *  desta tabela, então basta atualizar aqui pra mudar quando ele fica "devido". */
  async updateScheduledAt(id: string, scheduledAt: string): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("scheduled_posts")
      .update({ scheduled_at: scheduledAt, updated_at: new Date().toISOString() })
      .eq("id", id);
    throwIfError(null, error);
  },

  /** Recalcula o status agregado a partir dos destinos (scheduled_post_accounts) e persiste.
   *  Um erro num destino nunca derruba os demais — isso só reflete o agregado pra listagem. */
  async syncStatusFromAccounts(id: string): Promise<void> {
    const accounts = await scheduledPostAccountsRepo.listByPost(id);
    if (accounts.length === 0) return;
    let next: ScheduledPostStatus;
    if (accounts.every((a) => a.status === "cancelled")) next = "cancelled";
    else if (accounts.some((a) => a.status === "scheduled" || a.status === "processing")) next = "processing";
    else if (accounts.every((a) => a.status === "published" || a.status === "cancelled")) next = "published";
    else if (accounts.some((a) => a.status === "failed")) next = "failed";
    else next = "processing";
    await scheduledPostsRepo.updateStatus(id, next);
  },
};

type ScheduledPostAccountRow = {
  id: string;
  scheduled_post_id: string;
  social_account_id: string;
  status: string;
  external_post_id: string | null;
  error_code: string | null;
  error_message: string | null;
  recoverable: boolean | null;
  attempt_count: number;
  next_attempt_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function scheduledPostAccountFromRow(row: ScheduledPostAccountRow): ScheduledPostAccount {
  return {
    id: row.id,
    scheduledPostId: row.scheduled_post_id,
    socialAccountId: row.social_account_id,
    status: row.status as ScheduledPostAccountStatus,
    externalPostId: row.external_post_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    recoverable: row.recoverable,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const scheduledPostAccountsRepo = {
  async listByPost(scheduledPostId: string): Promise<ScheduledPostAccount[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("scheduled_post_accounts")
      .select("*")
      .eq("scheduled_post_id", scheduledPostId)
      .order("created_at", { ascending: true });
    return throwIfError(data ?? [], error).map((row) => scheduledPostAccountFromRow(row as ScheduledPostAccountRow));
  },

  async get(id: string): Promise<ScheduledPostAccount | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("scheduled_post_accounts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const row = throwIfError(data, error);
    return row ? scheduledPostAccountFromRow(row as ScheduledPostAccountRow) : null;
  },

  async create(row: ScheduledPostAccount): Promise<void> {
    const { error } = await getSupabaseAdmin().from("scheduled_post_accounts").insert({
      id: row.id,
      scheduled_post_id: row.scheduledPostId,
      social_account_id: row.socialAccountId,
      status: row.status,
      external_post_id: row.externalPostId,
      error_code: row.errorCode,
      error_message: row.errorMessage,
      recoverable: row.recoverable,
      attempt_count: row.attemptCount,
      next_attempt_at: row.nextAttemptAt,
      published_at: row.publishedAt,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    });
    throwIfError(null, error);
  },

  /** Reivindica atomicamente 1 destino pendente antes de publicar — evita duplicar a
   *  publicação se dois disparos do scheduler rodarem ao mesmo tempo (o UPDATE só afeta a
   *  linha se ela ainda estiver "scheduled"; 0 linhas afetadas = outro worker já pegou). */
  async claim(id: string): Promise<boolean> {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("scheduled_post_accounts")
      .update({ status: "processing", updated_at: now })
      .eq("id", id)
      .eq("status", "scheduled")
      .select("id");
    throwIfError(data, error);
    return (data?.length ?? 0) === 1;
  },

  async listDue(nowIso: string): Promise<ScheduledPostAccount[]> {
    // Supabase/PostgREST não faz JOIN direto por aqui — busca os posts "due" primeiro e filtra
    // os destinos "scheduled" por post_id (bases de 30-100 contas nunca chegam perto do limite
    // de IN() do Postgres).
    const { data: duePosts, error: postsError } = await getSupabaseAdmin()
      .from("scheduled_posts")
      .select("id")
      .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`);
    throwIfError(duePosts, postsError);
    const postIds = (duePosts ?? []).map((p: { id: string }) => p.id);
    if (postIds.length === 0) return [];

    const { data, error } = await getSupabaseAdmin()
      .from("scheduled_post_accounts")
      .select("*")
      .eq("status", "scheduled")
      .in("scheduled_post_id", postIds)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`);
    return throwIfError(data ?? [], error).map((row) => scheduledPostAccountFromRow(row as ScheduledPostAccountRow));
  },

  async updateResult(
    id: string,
    patch: Partial<{
      status: ScheduledPostAccountStatus;
      externalPostId: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      recoverable: boolean | null;
      attemptCount: number;
      nextAttemptAt: string | null;
      publishedAt: string | null;
    }>
  ): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("scheduled_post_accounts")
      .update({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.externalPostId !== undefined ? { external_post_id: patch.externalPostId } : {}),
        ...(patch.errorCode !== undefined ? { error_code: patch.errorCode } : {}),
        ...(patch.errorMessage !== undefined ? { error_message: patch.errorMessage } : {}),
        ...(patch.recoverable !== undefined ? { recoverable: patch.recoverable } : {}),
        ...(patch.attemptCount !== undefined ? { attempt_count: patch.attemptCount } : {}),
        ...(patch.nextAttemptAt !== undefined ? { next_attempt_at: patch.nextAttemptAt } : {}),
        ...(patch.publishedAt !== undefined ? { published_at: patch.publishedAt } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    throwIfError(null, error);
  },
};

// --- publication_logs ------------------------------------------------------------------------

type PublicationLogRow = {
  id: string;
  user_id: string | null;
  scheduled_post_id: string | null;
  social_account_id: string | null;
  platform: string | null;
  action: string;
  status: string;
  external_post_id: string | null;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function publicationLogFromRow(row: PublicationLogRow): PublicationLog {
  return {
    id: row.id,
    userId: row.user_id,
    scheduledPostId: row.scheduled_post_id,
    socialAccountId: row.social_account_id,
    platform: row.platform as SocialPlatform | null,
    action: row.action as PublicationLogAction,
    status: row.status as PublicationLogStatus,
    externalPostId: row.external_post_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

/** Nunca receba um token/segredo em `metadata` — este log é só para diagnóstico operacional
 *  e pode ser lido por qualquer tela de auditoria no futuro. */
export const publicationLogsRepo = {
  async create(log: Omit<PublicationLog, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<string> {
    const id = log.id ?? crypto.randomUUID();
    const { error } = await getSupabaseAdmin()
      .from("publication_logs")
      .insert({
        id,
        user_id: log.userId ?? null,
        scheduled_post_id: log.scheduledPostId ?? null,
        social_account_id: log.socialAccountId ?? null,
        platform: log.platform ?? null,
        action: log.action,
        status: log.status,
        external_post_id: log.externalPostId ?? null,
        error_code: log.errorCode ?? null,
        error_message: log.errorMessage ?? null,
        metadata: log.metadata ?? {},
        created_at: log.createdAt ?? new Date().toISOString(),
      });
    throwIfError(null, error);
    return id;
  },

  async listBySocialAccount(socialAccountId: string, limit = 50): Promise<PublicationLog[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("publication_logs")
      .select("*")
      .eq("social_account_id", socialAccountId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return throwIfError(data ?? [], error).map((row) => publicationLogFromRow(row as PublicationLogRow));
  },

  async listRecent(limit = 100): Promise<PublicationLog[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("publication_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return throwIfError(data ?? [], error).map((row) => publicationLogFromRow(row as PublicationLogRow));
  },
};

// --- meta_oauth_states / meta_oauth_sessions --------------------------------------------------

export const metaOAuthStateRepo = {
  async create(ttlMinutes = 10): Promise<string> {
    const state = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
    const { error } = await getSupabaseAdmin()
      .from("meta_oauth_states")
      .insert({ state, created_at: now.toISOString(), expires_at: expiresAt });
    throwIfError(null, error);
    return state;
  },

  /** Valida e consome (uso único) — retorna false se o state não existir, já tiver sido usado
   *  ou tiver expirado. Essencial pra proteção contra CSRF no callback do OAuth. */
  async consume(state: string): Promise<boolean> {
    const { data, error } = await getSupabaseAdmin()
      .from("meta_oauth_states")
      .delete()
      .eq("state", state)
      .select("expires_at")
      .maybeSingle();
    throwIfError(data, error);
    if (!data) return false;
    return (data as { expires_at: string }).expires_at >= new Date().toISOString();
  },

  async cleanupExpired(): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("meta_oauth_states")
      .delete()
      .lt("expires_at", new Date().toISOString());
    throwIfError(null, error);
  },
};

export const metaOAuthSessionRepo = {
  /** `discovered` é serializado e criptografado inteiro (contém os tokens de Página) — só é
   *  decodificado no servidor, nunca devolvido cru pela API. */
  async create(input: { metaUserId: string | null; discovered: unknown; ttlMinutes?: number }): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.ttlMinutes ?? 15) * 60_000).toISOString();
    const { error } = await getSupabaseAdmin().from("meta_oauth_sessions").insert({
      id,
      meta_user_id: input.metaUserId,
      discovered_encrypted: encryptSecret(JSON.stringify(input.discovered)),
      created_at: now.toISOString(),
      expires_at: expiresAt,
    });
    throwIfError(null, error);
    return id;
  },

  async get<T>(id: string): Promise<{ metaUserId: string | null; discovered: T; expiresAt: string } | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("meta_oauth_sessions")
      .select("meta_user_id, discovered_encrypted, expires_at")
      .eq("id", id)
      .maybeSingle();
    const row = throwIfError(data, error) as { meta_user_id: string | null; discovered_encrypted: string; expires_at: string } | null;
    if (!row) return null;
    if (row.expires_at < new Date().toISOString()) {
      await metaOAuthSessionRepo.remove(id);
      return null;
    }
    return {
      metaUserId: row.meta_user_id,
      discovered: JSON.parse(decryptSecret(row.discovered_encrypted)) as T,
      expiresAt: row.expires_at,
    };
  },

  async remove(id: string): Promise<void> {
    const { error } = await getSupabaseAdmin().from("meta_oauth_sessions").delete().eq("id", id);
    throwIfError(null, error);
  },
};

// --- meta_integration_logs ---------------------------------------------------------------------

type MetaIntegrationLogRow = {
  id: string;
  step: string;
  social_account_id: string | null;
  endpoint: string | null;
  http_status: number | null;
  meta_error_code: number | null;
  meta_error_subcode: number | null;
  message: string | null;
  fbtrace_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function metaIntegrationLogFromRow(row: MetaIntegrationLogRow): MetaIntegrationLogEntry {
  return {
    id: row.id,
    step: row.step as MetaIntegrationStep,
    socialAccountId: row.social_account_id,
    endpoint: row.endpoint,
    httpStatus: row.http_status,
    metaErrorCode: row.meta_error_code,
    metaErrorSubcode: row.meta_error_subcode,
    message: row.message,
    fbtraceId: row.fbtrace_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

/** Ver lib/server/meta/log.ts — não chame create() diretamente fora dali, para garantir que o
 *  console.log estruturado e a persistência aconteçam sempre juntos. */
export const metaIntegrationLogsRepo = {
  async create(entry: {
    step: MetaIntegrationStep;
    socialAccountId?: string | null;
    endpoint?: string | null;
    httpStatus?: number | null;
    metaErrorCode?: number | null;
    metaErrorSubcode?: number | null;
    message?: string | null;
    fbtraceId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await getSupabaseAdmin().from("meta_integration_logs").insert({
      step: entry.step,
      social_account_id: entry.socialAccountId ?? null,
      endpoint: entry.endpoint ?? null,
      http_status: entry.httpStatus ?? null,
      meta_error_code: entry.metaErrorCode ?? null,
      meta_error_subcode: entry.metaErrorSubcode ?? null,
      message: entry.message ?? null,
      fbtrace_id: entry.fbtraceId ?? null,
      metadata: entry.metadata ?? {},
    });
    throwIfError(null, error);
  },

  async listBySocialAccount(socialAccountId: string, limit = 30): Promise<MetaIntegrationLogEntry[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("meta_integration_logs")
      .select("*")
      .eq("social_account_id", socialAccountId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return throwIfError(data ?? [], error).map((row) => metaIntegrationLogFromRow(row as MetaIntegrationLogRow));
  },
};
