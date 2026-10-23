import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { google } from "googleapis";
import { streamDriveFile } from "@/lib/server/google-drive";
import type { ScheduledPost } from "@/lib/server/meta/types";

// Conexão de canais do YouTube (publicação de Shorts). Usa o mesmo cliente OAuth do Google Cloud
// do Drive (GOOGLE_CLIENT_ID/SECRET), mas num consentimento SEPARADO — a Google bloqueia
// combinar youtube.upload com os escopos do Drive. Cada canal vira uma linha em social_accounts
// (platform YOUTUBE) guardando o refresh token criptografado; o access token de 1h é obtido na
// hora de publicar.

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function getYoutubeRedirectUri(): string {
  const explicit = process.env.YOUTUBE_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const drive = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (drive) return drive.replace(/\/api\/drive\/callback\/?$/, "/api/youtube/callback");
  throw new Error("YOUTUBE_REDIRECT_URI não definido — configure no .env.local.");
}

export function isYoutubeConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      (process.env.YOUTUBE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI)
  );
}

function newOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, getYoutubeRedirectUri());
}

export function buildYoutubeAuthorizationUrl(state: string): string {
  return newOAuthClient().generateAuthUrl({
    access_type: "offline",
    // "consent" garante o refresh token; "select_account" deixa escolher outro canal/conta a
    // cada conexão (o usuário tem vários canais).
    prompt: "consent select_account",
    scope: YOUTUBE_SCOPES,
    state,
  });
}

export type ConnectedYoutubeChannel = {
  channelId: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
  refreshToken: string;
  scopes: string[];
};

export async function exchangeYoutubeCode(code: string): Promise<ConnectedYoutubeChannel> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "A Google não devolveu um refresh token. Remova o acesso do Zenx em myaccount.google.com/permissions e conecte de novo."
    );
  }
  client.setCredentials(tokens);
  const youtube = google.youtube({ version: "v3", auth: client });
  const res = await youtube.channels.list({ part: ["snippet"], mine: true });
  const channel = res.data.items?.[0];
  if (!channel?.id) {
    throw new Error("Essa conta Google não tem um canal do YouTube. Crie um canal e tente de novo.");
  }
  return {
    channelId: channel.id,
    title: channel.snippet?.title || "YouTube",
    handle: channel.snippet?.customUrl?.replace(/^@/, "") || null,
    thumbnailUrl: channel.snippet?.thumbnails?.default?.url || null,
    refreshToken: tokens.refresh_token,
    scopes: (tokens.scope ?? "").split(/\s+/).filter(Boolean),
  };
}

function clientFromRefreshToken(refreshToken: string) {
  const client = newOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export class YoutubePublishError extends Error {
  code: string;
  recoverable: boolean;
  isAuthError: boolean;
  constructor(message: string, opts: { code: string; recoverable: boolean; isAuthError: boolean }) {
    super(message);
    this.name = "YoutubePublishError";
    this.code = opts.code;
    this.recoverable = opts.recoverable;
    this.isAuthError = opts.isAuthError;
  }
}

type GaxiosLike = {
  code?: string | number;
  status?: number;
  message?: string;
  response?: { status?: number; data?: { error?: unknown } };
};

/** Traduz erros do googleapis para o mesmo contrato usado pelo scheduler (código, mensagem,
 *  recuperável, erro de autenticação). */
export function describeYoutubeError(err: unknown): YoutubePublishError {
  if (err instanceof YoutubePublishError) return err;
  const e = (err ?? {}) as GaxiosLike;
  const status = Number(e.status ?? e.response?.status ?? (typeof e.code === "number" ? e.code : 0)) || 0;
  const raw = `${JSON.stringify(e.response?.data?.error ?? "")} ${e.message ?? ""}`;

  if (/invalid_grant/i.test(raw)) {
    return new YoutubePublishError("A autorização do canal foi revogada ou expirou — reconecte o canal.", {
      code: "YOUTUBE_INVALID_GRANT",
      recoverable: false,
      isAuthError: true,
    });
  }
  if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(raw)) {
    return new YoutubePublishError(
      "Cota diária da API do YouTube esgotada (≈6 uploads/dia por projeto). Tente de novo amanhã ou peça aumento de cota à Google.",
      { code: "YOUTUBE_QUOTA_EXCEEDED", recoverable: false, isAuthError: false }
    );
  }
  if (/uploadLimitExceeded/i.test(raw)) {
    return new YoutubePublishError("O canal atingiu o limite diário de uploads do YouTube.", {
      code: "YOUTUBE_UPLOAD_LIMIT",
      recoverable: false,
      isAuthError: false,
    });
  }
  if (status === 401 || /insufficient.*scope|insufficientPermissions/i.test(raw)) {
    return new YoutubePublishError("Permissão insuficiente no YouTube — reconecte o canal.", {
      code: "YOUTUBE_AUTH",
      recoverable: false,
      isAuthError: true,
    });
  }
  const transient = status === 429 || status >= 500 || /ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(raw);
  return new YoutubePublishError(e.message || "Falha ao publicar no YouTube.", {
    code: status ? `YOUTUBE_HTTP_${status}` : "YOUTUBE_ERROR",
    recoverable: transient,
    isAuthError: false,
  });
}

/** Valida o refresh token (tenta emitir um access token) — invalid_grant = revogado/expirado. */
export async function checkYoutubeRefreshToken(refreshToken: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const { token } = await clientFromRefreshToken(refreshToken).getAccessToken();
    return token ? { valid: true } : { valid: false, reason: "A Google não emitiu um access token." };
  } catch (err) {
    return { valid: false, reason: describeYoutubeError(err).message };
  }
}

/** O YouTube trata como Short um vídeo vertical de até 60s; a hashtag #Shorts ajuda na
 *  classificação. Título ≤ 100 chars (limite da API) e sem quebras de linha. */
export function buildShortMetadata(caption: string): { title: string; description: string } {
  const clean = caption.trim();
  const firstLine = clean.split(/\r?\n/)[0]?.trim() || "Vídeo";
  const suffix = " #Shorts";
  const base = firstLine.replace(/\s*#shorts\b/gi, "").trim() || "Vídeo";
  const title = (base.length + suffix.length > 100 ? `${base.slice(0, 100 - suffix.length - 1)}…` : base) + suffix;
  const description = !clean ? "#Shorts" : /#shorts/i.test(clean) ? clean : `${clean}\n\n#Shorts`;
  return { title, description };
}

async function openVideoStream(post: ScheduledPost): Promise<Readable> {
  if (post.videoSource === "drive") {
    if (!post.driveFileId) throw new Error("Post marcado como Google Drive mas sem drive_file_id salvo.");
    return (await streamDriveFile(post.driveFileId)).stream;
  }
  if (!post.videoUrl) throw new Error("Post sem video_url e sem drive_file_id — nada para publicar.");
  const res = await fetch(post.videoUrl);
  if (!res.ok || !res.body) throw new Error(`Não foi possível baixar o vídeo (HTTP ${res.status}).`);
  return Readable.fromWeb(res.body as unknown as NodeWebReadableStream);
}

/** Envia o vídeo do post como Short para o canal dono do refresh token. Só lança
 *  YoutubePublishError. */
export async function publishYoutubeShort(params: {
  refreshToken: string;
  post: ScheduledPost;
}): Promise<{ externalId: string }> {
  try {
    const body = await openVideoStream(params.post);
    const youtube = google.youtube({ version: "v3", auth: clientFromRefreshToken(params.refreshToken) });
    const { title, description } = buildShortMetadata(params.post.caption);
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description, categoryId: "22" },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      },
      media: { body },
    });
    const id = res.data.id;
    if (!id) throw new Error("O YouTube não retornou um ID de vídeo.");
    return { externalId: id };
  } catch (err) {
    throw describeYoutubeError(err);
  }
}
