/** Tipos de domínio da integração com a Meta (Instagram + Facebook) e do agendamento
 *  multi-conta. Ver docs/META_INTEGRATION_SETUP.md para o desenho geral da arquitetura. */

export type SocialPlatform = "INSTAGRAM" | "FACEBOOK";

export type SocialAccountStatus = "connected" | "expired" | "revoked" | "error";

/** Uma conta social conectada (uma Página do Facebook OU uma conta profissional do
 *  Instagram vinculada a uma Página) — cada conexão é uma linha independente, nunca colunas
 *  tipo instagram_1/instagram_2. */
export type SocialAccount = {
  id: string;
  /** Reservado para quando o sistema ganhar múltiplos usuários — hoje é sempre null (instância
   *  single-tenant, sem login; ver docs/META_INTEGRATION_SETUP.md). */
  userId: string | null;
  platform: SocialPlatform;
  /** ID da Página (Facebook) ou o Instagram User ID (Instagram). */
  platformAccountId: string;
  /** Página do Facebook associada. Para linhas FACEBOOK é igual a platformAccountId; para
   *  linhas INSTAGRAM é a Página à qual a conta profissional está vinculada (a publicação no
   *  Instagram usa o access token dessa Página). */
  pageId: string | null;
  /** Só preenchido para linhas INSTAGRAM. */
  instagramUserId: string | null;
  accountName: string;
  username: string | null;
  profilePictureUrl: string | null;
  status: SocialAccountStatus;
  /** ID do usuário Meta (pessoa) que autorizou — permite agrupar contas vindas do mesmo login
   *  e é usado para saber qual token de Página faz cada uma funcionar. */
  metaUserId: string | null;
  tokenExpiresAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/** Mesma forma de SocialAccount — nunca inclui o token, então é seguro devolver direto pra UI. */
export type PublicSocialAccount = SocialAccount;

export type ScheduledPostStatus = "draft" | "scheduled" | "processing" | "published" | "failed" | "cancelled";

export type ScheduledPost = {
  id: string;
  userId: string | null;
  videoUrl: string;
  caption: string;
  scheduledAt: string | null;
  /** Status agregado (derivado dos destinos) — útil pra listagens; a verdade por destino
   *  sempre vive em ScheduledPostAccount. */
  status: ScheduledPostStatus;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledPostAccountStatus = "scheduled" | "processing" | "published" | "failed" | "cancelled";

/** Um destino de publicação dentro de um ScheduledPost — 1 vídeo pode ter N linhas dessas
 *  (uma por conta social), cada uma com seu próprio status/erro/retry, independente das demais. */
export type ScheduledPostAccount = {
  id: string;
  scheduledPostId: string;
  socialAccountId: string;
  status: ScheduledPostAccountStatus;
  externalPostId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  /** Recuperável = vale a pena tentar de novo (rate limit, timeout); não recuperável = token
   *  inválido, conta removida etc. — ver lib/server/meta/publish.ts. */
  recoverable: boolean | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicationLogAction =
  | "oauth_connect"
  | "oauth_disconnect"
  | "oauth_reconnect"
  | "publish_attempt"
  | "token_check"
  | "token_refresh"
  | "meta_deauthorize"
  | "meta_data_deletion";

export type PublicationLogStatus = "success" | "failure" | "info";

/** Nunca contém tokens completos — só metadados operacionais. */
export type PublicationLog = {
  id: string;
  userId: string | null;
  scheduledPostId: string | null;
  socialAccountId: string | null;
  platform: SocialPlatform | null;
  action: PublicationLogAction;
  status: PublicationLogStatus;
  externalPostId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// --- Descoberta de ativos (fluxo OAuth) --------------------------------------------------

export type DiscoveredFacebookPage = {
  key: string; // `page:${pageId}`
  platform: "FACEBOOK";
  pageId: string;
  name: string;
  username: string | null;
  profilePictureUrl: string | null;
  category: string | null;
  alreadyConnected: boolean;
};

export type DiscoveredInstagramAccount = {
  key: string; // `instagram:${igUserId}`
  platform: "INSTAGRAM";
  instagramUserId: string;
  pageId: string;
  pageName: string;
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  alreadyConnected: boolean;
};

export type DiscoveredAsset = DiscoveredFacebookPage | DiscoveredInstagramAccount;

export type DiscoverySessionSummary = {
  sessionId: string;
  metaUserId: string | null;
  expiresAt: string;
  assets: DiscoveredAsset[];
};

// --- Respostas da Graph API relevantes ---------------------------------------------------

export type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export type GraphOAuthTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

export type GraphDebugTokenResponse = {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    expires_at?: number; // unix seconds, 0 = não expira
    data_access_expires_at?: number;
    scopes?: string[];
    user_id?: string;
    error?: { code?: number; message?: string; subcode?: number };
  };
};

export type GraphInstagramBusinessAccount = {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

export type GraphPage = {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: GraphInstagramBusinessAccount;
};

export type GraphAccountsResponse = {
  data?: GraphPage[];
  paging?: { next?: string; cursors?: { after?: string } };
};

export type GraphMeResponse = { id: string; name?: string };
