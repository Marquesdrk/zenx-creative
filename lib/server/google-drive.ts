import { google } from "googleapis";
import { Readable } from "node:stream";
import { googleDriveTokensRepo, type GoogleDriveTokens } from "@/lib/server/google/drive-tokens-db";

// Só o escopo do Drive: a Google bloqueia combinar youtube.upload com outros escopos no mesmo
// consentimento ("This request contains scopes that cannot be requested together") — APIs como o
// YouTube exigem uma autorização OAuth separada e dedicada. Se algum dia o upload direto pro
// YouTube (lib/server/publishing/youtube.ts) precisar funcionar de verdade, ele precisa do
// próprio fluxo de conexão/token, não pode reaproveitar este. Tokens vivem no Supabase (ver
// lib/server/google/drive-tokens-db.ts) — precisam sobreviver a cold starts na Vercel.
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const ROOT_FOLDER_NAME = "Zenx Creative - Agendados";

/** Credenciais de um app OAuth do Google Cloud (Desktop ou Web), com a Drive API habilitada.
 *  Ver .env.local.example para o passo a passo de como gerar essas três variáveis. */
export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI
  );
}

async function getOAuthClient() {
  if (!isDriveConfigured()) return null;
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const tokens = await googleDriveTokensRepo.get();
  if (!tokens) return null;
  client.setCredentials(tokens);
  client.on("tokens", (refreshed) => {
    void googleDriveTokensRepo.set(refreshed as GoogleDriveTokens);
  });
  return client;
}

/** Cliente Google autenticado para reaproveitar em outros adapters do mesmo consentimento
 *  (ex.: lib/server/publishing/youtube.ts) — retorna null se não configurado/conectado. */
export async function getGoogleAuthClient() {
  return getOAuthClient();
}

export async function isDriveConnected(): Promise<boolean> {
  if (!isDriveConfigured()) return false;
  return (await googleDriveTokensRepo.get()) !== null;
}

export function getAuthUrl(): string {
  if (!isDriveConfigured()) {
    throw new Error(
      "Google Drive não configurado — defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI."
    );
  }
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
}

export async function handleOAuthCallback(code: string): Promise<void> {
  if (!isDriveConfigured()) throw new Error("Google Drive não configurado.");
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const { tokens } = await client.getToken(code);
  await googleDriveTokensRepo.set(tokens as GoogleDriveTokens);
}

export async function disconnectDrive(): Promise<void> {
  await googleDriveTokensRepo.clear();
}

// Cache em memória do processo (mesma ideia do antigo cachedFolderId) — evita 2 buscas por
// upload; se o processo reiniciar, a próxima chamada só refaz a busca/criação uma vez.
const folderIdCache = new Map<string, string>();

async function ensureFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string | null
): Promise<string> {
  const cacheKey = `${parentId ?? "root"}/${name}`;
  const cached = folderIdCache.get(cacheKey);
  if (cached) return cached;

  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const existing = await drive.files.list({
    q: `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`,
    fields: "files(id, name)",
  });
  const found = existing.data.files?.[0]?.id;
  if (found) {
    folderIdCache.set(cacheKey, found);
    return found;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  const id = created.data.id!;
  folderIdCache.set(cacheKey, id);
  return id;
}

/** Garante a estrutura "Zenx Creative - Agendados/@usuario" e devolve o id da subpasta —
 *  organiza os vídeos agendados por conta do Instagram dentro do Drive do usuário. */
async function ensureAccountFolder(client: InstanceType<typeof google.auth.OAuth2>, username: string): Promise<string> {
  const drive = google.drive({ version: "v3", auth: client });
  const rootId = await ensureFolder(drive, ROOT_FOLDER_NAME, null);
  const accountFolderName = `@${username.replace(/^@/, "")}`;
  return ensureFolder(drive, accountFolderName, rootId);
}

/** Sobe um vídeo agendado para a pasta da conta no Drive (criando-a se preciso) e devolve o
 *  fileId — esse é o único dado persistido (scheduled_posts.drive_file_id); o arquivo nunca é
 *  duplicado em outro storage. */
export async function uploadScheduledVideoToDrive(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  instagramUsername: string
): Promise<{ fileId: string; fileName: string }> {
  const client = await getOAuthClient();
  if (!client) throw new Error("Google Drive não conectado — conecte em Configurações antes de enviar vídeos.");
  const drive = google.drive({ version: "v3", auth: client });
  const folderId = await ensureAccountFolder(client, instagramUsername);
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(fileBuffer) },
    fields: "id, name",
  });
  if (!res.data.id) throw new Error("O Google Drive não retornou um ID de arquivo após o upload.");
  return { fileId: res.data.id, fileName: res.data.name ?? filename };
}

export type DriveFileStream = {
  stream: Readable;
  mimeType: string;
  size: number | null;
  contentRange: string | null;
  status: number;
};

/** Baixa um arquivo do Drive como stream para repassar via proxy HTTP próprio (ver
 *  app/api/drive/stream/[fileId]/route.ts) — a Meta não consegue baixar direto do Drive sem
 *  autenticação, então o Zenx faz essa ponte sem nunca gravar uma segunda cópia do vídeo. */
export async function streamDriveFile(fileId: string, rangeHeader?: string | null): Promise<DriveFileStream> {
  const client = await getOAuthClient();
  if (!client) throw new Error("Google Drive não conectado.");
  const drive = google.drive({ version: "v3", auth: client });

  const meta = await drive.files.get({ fileId, fields: "mimeType, size" });
  const mimeType = meta.data.mimeType ?? "video/mp4";
  const size = meta.data.size ? Number(meta.data.size) : null;

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream", headers: rangeHeader ? { Range: rangeHeader } : undefined }
  );
  const headers = res.headers as Record<string, string> | undefined;
  return {
    stream: res.data as unknown as Readable,
    mimeType,
    size,
    contentRange: headers?.["content-range"] ?? null,
    status: res.status,
  };
}
