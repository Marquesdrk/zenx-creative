import { createReadStream } from "node:fs";
import { google } from "googleapis";
import { driveTokensRepo } from "./db";

// O mesmo consentimento também autoriza upload no YouTube (lib/server/publishing/youtube.ts),
// evitando um segundo fluxo de OAuth só para isso.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/youtube.upload",
];
const FOLDER_NAME = "Vídeos para postar";

/** Credenciais de um app OAuth do Google Cloud (Desktop ou Web), com a Drive API habilitada.
 *  Ver .env.local.example para o passo a passo de como gerar essas três variáveis. */
export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI
  );
}

function getOAuthClient() {
  if (!isDriveConfigured()) return null;
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const tokens = driveTokensRepo.get();
  if (tokens) client.setCredentials(tokens);
  client.on("tokens", (refreshed) => {
    driveTokensRepo.set({ ...(driveTokensRepo.get() ?? {}), ...refreshed } as Record<string, unknown>);
  });
  return client;
}

export function isDriveConnected(): boolean {
  return isDriveConfigured() && driveTokensRepo.get() !== null;
}

export function getAuthUrl(): string {
  const client = getOAuthClient();
  if (!client) {
    throw new Error(
      "Google Drive não configurado — defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI."
    );
  }
  return client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
}

export async function handleOAuthCallback(code: string): Promise<void> {
  const client = getOAuthClient();
  if (!client) throw new Error("Google Drive não configurado.");
  const { tokens } = await client.getToken(code);
  driveTokensRepo.set(tokens as Record<string, unknown>);
}

let cachedFolderId: string | null = null;

async function ensureFolder(auth: InstanceType<typeof google.auth.OAuth2>): Promise<string> {
  if (cachedFolderId) return cachedFolderId;
  const drive = google.drive({ version: "v3", auth });
  const existing = await drive.files.list({
    q: `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
  });
  const found = existing.data.files?.[0]?.id;
  if (found) {
    cachedFolderId = found;
    return found;
  }
  const created = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id",
  });
  cachedFolderId = created.data.id!;
  return cachedFolderId;
}

/** Envia um render concluído para a pasta "Vídeos para postar" no Drive. Não faz nada (e
 *  não lança erro) se o Drive não estiver conectado — o vídeo continua servido localmente
 *  em /renders/ normalmente. */
export async function uploadRenderToDrive(filePath: string, filename: string): Promise<{ fileId: string } | null> {
  if (!isDriveConnected()) return null;
  const client = getOAuthClient();
  if (!client) return null;
  const drive = google.drive({ version: "v3", auth: client });
  const folderId = await ensureFolder(client);
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: "video/mp4", body: createReadStream(filePath) },
    fields: "id",
  });
  return res.data.id ? { fileId: res.data.id } : null;
}
