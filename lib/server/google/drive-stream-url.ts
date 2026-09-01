import { createHmac, timingSafeEqual } from "node:crypto";

// URLs assinadas e de curta duração para o proxy de streaming do Drive
// (app/api/drive/stream/[fileId]/route.ts). A Meta baixa o vídeo dessa URL sem autenticação —
// a assinatura HMAC + expiração evitam que alguém descubra um fileId e baixe o vídeo por conta
// própria fora da janela de publicação.

function getSecret(): string {
  const secret = process.env.DRIVE_STREAM_SECRET || process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "DRIVE_STREAM_SECRET (ou META_TOKEN_ENCRYPTION_KEY) não definida — necessária para assinar as URLs de streaming do Drive."
    );
  }
  return secret;
}

function sign(fileId: string, expiresAt: number): string {
  return createHmac("sha256", getSecret()).update(`${fileId}.${expiresAt}`).digest("hex");
}

/** Gera uma URL própria (PUBLIC_BASE_URL + /api/drive/stream/:fileId) que, quando baixada,
 *  repassa o conteúdo do arquivo do Drive — é essa URL que vira `scheduled_posts.video_url`
 *  na hora de publicar. Gerada sob demanda a cada tentativa de publicação, nunca persistida. */
export function buildSignedDriveStreamUrl(fileId: string, ttlSeconds = 1800): string {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("PUBLIC_BASE_URL não definida — necessária para gerar a URL pública do vídeo no Drive.");
  }
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const sig = sign(fileId, expiresAt);
  return `${base}/api/drive/stream/${fileId}?exp=${expiresAt}&sig=${sig}`;
}

export function verifyDriveStreamToken(fileId: string, expiresAtRaw: string | null, sigRaw: string | null): boolean {
  if (!expiresAtRaw || !sigRaw) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = Buffer.from(sign(fileId, expiresAt), "hex");
  const provided = Buffer.from(sigRaw, "hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
