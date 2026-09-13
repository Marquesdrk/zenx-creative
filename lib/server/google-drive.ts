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
const REACTION_ROOT_FOLDER_NAME = "Zenx Creative - Reações";

type DriveTokenCache = {
  loaded: boolean;
  tokens: GoogleDriveTokens | null;
  pending: Promise<GoogleDriveTokens | null> | null;
};

const globalForDrive = globalThis as typeof globalThis & { __zenxDriveTokenCache?: DriveTokenCache };

function driveTokenCache() {
  globalForDrive.__zenxDriveTokenCache ??= { loaded: false, tokens: null, pending: null };
  return globalForDrive.__zenxDriveTokenCache;
}

function isTransientTokenReadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /gateway timeout|\b50[234]\b|timeout|timed out|econnreset|etimedout|fetch failed/i.test(message);
}

async function loadDriveTokens() {
  const cache = driveTokenCache();
  if (cache.loaded) return cache.tokens;
  if (cache.pending) return cache.pending;

  const pending = (async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await googleDriveTokensRepo.get();
      } catch (error) {
        if (!isTransientTokenReadError(error) || attempt >= 2) throw error;
        console.warn("[google-drive] Supabase timeout while reading Drive tokens; retrying", { attempt: attempt + 1 });
        await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** attempt));
      }
    }
  })();
  cache.pending = pending;
  try {
    const tokens = await pending;
    cache.tokens = tokens;
    cache.loaded = true;
    return tokens;
  } finally {
    if (cache.pending === pending) cache.pending = null;
  }
}

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
  const tokens = await loadDriveTokens();
  if (!tokens) return null;
  client.setCredentials(tokens);
  client.on("tokens", (refreshed) => {
    const cache = driveTokenCache();
    cache.tokens = { ...(cache.tokens ?? tokens), ...(refreshed as GoogleDriveTokens) };
    cache.loaded = true;
    void googleDriveTokensRepo.set(refreshed as GoogleDriveTokens).catch((error) => {
      console.error("[google-drive] Failed to persist refreshed Drive tokens", error);
    });
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
  const client = await getOAuthClient();
  if (!client) return false;
  try {
    // Também força a renovação do access token quando ele expirou. Se o refresh token
    // foi revogado/expirou, o Drive deve aparecer como desconectado para permitir reconexão.
    const accessToken = await client.getAccessToken();
    return Boolean(accessToken.token);
  } catch {
    return false;
  }
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
  const cache = driveTokenCache();
  cache.tokens = tokens as GoogleDriveTokens;
  cache.loaded = true;
}

export async function disconnectDrive(): Promise<void> {
  await googleDriveTokensRepo.clear();
  const cache = driveTokenCache();
  cache.tokens = null;
  cache.loaded = true;
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

/** Garante uma cadeia de subpastas (ex.: ["Avatares Criados", "Guto"]) a partir da raiz do
 *  Drive e devolve o id da última — cada segmento é criado só se ainda não existir. */
async function ensureNestedFolder(drive: ReturnType<typeof google.drive>, segments: string[]): Promise<string> {
  let parentId: string | null = null;
  for (const segment of segments) {
    parentId = await ensureFolder(drive, segment, parentId);
  }
  if (!parentId) throw new Error("ensureNestedFolder chamado sem segmentos.");
  return parentId;
}

/** Igual a ensureNestedFolder, mas nunca cria nada — usado antes de listar arquivos, onde uma
 *  pasta inexistente só significa "nenhum vídeo enviado ainda", não um erro. */
async function findChildFolderId(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string | null
): Promise<string | null> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const res = await drive.files.list({
    q: `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`,
    fields: "files(id)",
  });
  return res.data.files?.[0]?.id ?? null;
}

async function findNestedFolderId(
  drive: ReturnType<typeof google.drive>,
  segments: string[],
  parentId: string | null = null
): Promise<string | null> {
  if (segments.length === 0) return parentId;
  const [head, ...rest] = segments;
  const id = await findChildFolderId(drive, head, parentId);
  if (!id) return null;
  return findNestedFolderId(drive, rest, id);
}

export type DriveFolderFile = { id: string; name: string; createdTime: string | null };

/** Lista os arquivos de vídeo de uma cadeia de pastas (ex.: pasta de agendados de uma conta),
 *  mais antigos primeiro — pensado pra distribuição automática de agendamento, onde a ordem de
 *  publicação segue a ordem de chegada no Drive. Pasta inexistente devolve lista vazia. */
export async function listFilesInFolder(folderSegments: string[]): Promise<DriveFolderFile[]> {
  const client = await getOAuthClient();
  if (!client) throw new Error("Google Drive não conectado — conecte em Configurações antes de listar arquivos.");
  const drive = google.drive({ version: "v3", auth: client });
  const folderId = await findNestedFolderId(drive, folderSegments);
  if (!folderId) return [];
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and mimeType contains 'video/'`,
    fields: "files(id, name, createdTime)",
    orderBy: "createdTime",
    pageSize: 1000,
  });
  return (res.data.files ?? []).map((file) => ({
    id: file.id!,
    name: file.name ?? "video.mp4",
    createdTime: file.createdTime ?? null,
  }));
}

/** Mesma pasta usada por uploadScheduledVideoToDrive — única fonte de verdade do nome, pra
 *  listagem e upload nunca divergirem sobre onde procurar/gravar os vídeos de uma conta. */
export function scheduledVideosFolderSegments(instagramUsername: string): string[] {
  return [ROOT_FOLDER_NAME, `@${instagramUsername.replace(/^@/, "")}`];
}

/** Pasta permanente das mídias reutilizáveis de reação de cada perfil. */
export function reactionMediaFolderSegments(instagramUsername: string): string[] {
  return [REACTION_ROOT_FOLDER_NAME, `@${instagramUsername.replace(/^@/, "")}`];
}

/** Garante que a pasta de agendados de uma conta já exista, sem subir nenhum arquivo — chamada
 *  assim que a conta é conectada (e disponível como ação manual pra contas já conectadas antes
 *  dessa checagem existir), pra o usuário já ter onde jogar vídeos manualmente sem precisar
 *  esperar o primeiro envio pelo próprio app criar a pasta sozinha. Nunca lança se o Drive não
 *  estiver conectado — só não faz nada (a conexão Meta não deve depender do Drive). */
export async function ensureScheduledVideosFolder(instagramUsername: string): Promise<void> {
  const client = await getOAuthClient();
  if (!client) return;
  const drive = google.drive({ version: "v3", auth: client });
  await ensureNestedFolder(drive, scheduledVideosFolderSegments(instagramUsername));
}

/** Remove um vídeo do Drive depois que a publicação for concluída com sucesso em todos os
 *  destinos — mantém a pasta de agendados refletindo só o que ainda falta postar, já que o
 *  fluxo manual (exportar local + arrastar pro Drive) usa essa pasta como fila visual. Nunca
 *  lança: falha ao apagar não deve derrubar o processamento da publicação. */
export async function deleteDriveFile(fileId: string): Promise<void> {
  const client = await getOAuthClient();
  if (!client) return;
  const drive = google.drive({ version: "v3", auth: client });
  await drive.files.delete({ fileId }).catch(() => {});
}

/** Sobe um arquivo qualquer para uma cadeia de pastas do Drive (criando-a se preciso) e
 *  devolve o fileId — usado tanto pelos vídeos agendados quanto pelos documentos/imagens do
 *  Criador de Avatar (lib/server/avatar-pipeline.ts). Nunca duplica o arquivo em outro storage. */
export async function uploadFileToDriveFolder(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  folderSegments: string[]
): Promise<{ fileId: string; fileName: string; folderId: string }> {
  const client = await getOAuthClient();
  if (!client) throw new Error("Google Drive não conectado — conecte em Configurações antes de enviar arquivos.");
  const drive = google.drive({ version: "v3", auth: client });
  const folderId = await ensureNestedFolder(drive, folderSegments);
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(fileBuffer) },
    fields: "id, name",
  });
  if (!res.data.id) throw new Error("O Google Drive não retornou um ID de arquivo após o upload.");
  return { fileId: res.data.id, fileName: res.data.name ?? filename, folderId };
}

/** Sobe um vídeo agendado para "Zenx Creative - Agendados/@conta" no Drive — esse é o único
 *  dado persistido (scheduled_posts.drive_file_id); o arquivo nunca é duplicado em outro storage. */
export async function uploadScheduledVideoToDrive(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  instagramUsername: string
): Promise<{ fileId: string; fileName: string }> {
  return uploadFileToDriveFolder(fileBuffer, filename, mimeType, scheduledVideosFolderSegments(instagramUsername));
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
