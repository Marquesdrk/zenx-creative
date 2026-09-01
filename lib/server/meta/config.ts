// Configuração central da integração Meta (Instagram + Facebook). Nada neste arquivo é
// importável por código de cliente — só rotas de API e outros módulos de lib/server/meta usam
// isso. Ver .env.local.example e docs/META_INTEGRATION_SETUP.md.

/** Versão fixa da Graph API — trocar aqui (e revisar o changelog da Meta) quando for hora de
 *  atualizar. Fixar explicitamente evita que o app comece a usar uma versão diferente sem
 *  aviso quando a Meta muda o "default" da conta do desenvolvedor. */
export const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || "v26.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
export const OAUTH_DIALOG_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
export const RUPLOAD_BASE = "https://rupload.facebook.com";
/** Graph API do Instagram usada pelo fluxo "Instagram API with Instagram Login" — tokens
 *  emitidos por esse fluxo só funcionam contra esse host, nunca graph.facebook.com. */
export const INSTAGRAM_GRAPH_BASE = `https://graph.instagram.com/${process.env.META_INSTAGRAM_GRAPH_API_VERSION?.trim() || GRAPH_API_VERSION}`;

const BASIC_META_OAUTH_SCOPES = ["public_profile"] as const;

const PUBLISH_META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "business_management",
] as const;

/** Permissões pedidas no consentimento. Por padrão começamos no modo básico para validar o
 * OAuth em apps recém-criados. Depois que a Meta liberar Páginas/Instagram, defina
 * META_OAUTH_SCOPE_MODE=publish no .env.local para pedir as permissões de autopost. */
export function getMetaOAuthScopes(): string[] {
  const custom = process.env.META_OAUTH_SCOPES?.trim();
  if (custom) {
    return custom
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);
  }
  return process.env.META_OAUTH_SCOPE_MODE === "publish"
    ? [...PUBLISH_META_OAUTH_SCOPES]
    : [...BASIC_META_OAUTH_SCOPES];
}

export function isMetaPublishMode(): boolean {
  return process.env.META_OAUTH_SCOPE_MODE === "publish" || Boolean(process.env.META_OAUTH_SCOPES?.trim());
}

/** Configuração criada em Facebook Login for Business. Na versão atual da Meta, ela define
 *  as permissões permitidas e substitui o envio manual de `scope` no diálogo OAuth. */
export function getMetaLoginConfigId(): string | null {
  return process.env.META_LOGIN_CONFIG_ID?.trim() || null;
}

export function canDiscoverMetaAssets(): boolean {
  // Login Configurations define the granted permissions inside Meta and therefore
  // do not expose them through the legacy `scope` environment variable.
  if (getMetaLoginConfigId()) return true;
  const scopes = getMetaOAuthScopes();
  return scopes.includes("pages_show_list") && scopes.includes("pages_read_engagement");
}

export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_REDIRECT_URI);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} não definido — configure no .env.local (veja .env.local.example).`);
  }
  return value;
}

export function getMetaAppId(): string {
  return required("META_APP_ID");
}

export function getMetaAppSecret(): string {
  return required("META_APP_SECRET");
}

export function getMetaRedirectUri(): string {
  return required("META_REDIRECT_URI");
}

/** App do Instagram Login pode ser o mesmo app da Meta usado pra Facebook Login (na maioria dos
 *  casos, um único app com os dois produtos ativados) ou um app dedicado — cai no app principal
 *  se as variáveis específicas não forem definidas. */
export function getInstagramAppId(): string {
  return process.env.META_INSTAGRAM_APP_ID?.trim() || getMetaAppId();
}

export function getInstagramAppSecret(): string {
  return process.env.META_INSTAGRAM_APP_SECRET?.trim() || getMetaAppSecret();
}

export function getInstagramRedirectUri(): string {
  return (
    process.env.META_INSTAGRAM_REDIRECT_URI?.trim() ||
    getMetaRedirectUri().replace(/\/api\/meta\/callback\/?$/, "/api/meta/instagram/callback")
  );
}

export function isInstagramLoginConfigured(): boolean {
  return Boolean(
    (process.env.META_INSTAGRAM_APP_ID?.trim() || process.env.META_APP_ID) &&
      (process.env.META_INSTAGRAM_APP_SECRET?.trim() || process.env.META_APP_SECRET)
  );
}

/** URL do painel para onde o navegador volta depois do OAuth.
 *  Em desenvolvimento o callback chega pelo ngrok, mas a UI roda no localhost. */
export function getMetaDashboardBaseUrl(requestUrl: string): string {
  const explicit = process.env.META_DASHBOARD_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV !== "production") {
    return `http://127.0.0.1:${process.env.PORT || "7070"}`;
  }

  return new URL(requestUrl).origin;
}

/** URL pública onde os vídeos renderizados ficam acessíveis (necessária pra Meta baixar o
 *  arquivo) — mesma variável já usada pelos adapters antigos de Instagram/Facebook/TikTok. */
export function getPublicBaseUrl(): string {
  return required("PUBLIC_BASE_URL");
}
