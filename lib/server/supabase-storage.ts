import { readFile } from "node:fs/promises";
import path from "node:path";

type UploadResult = {
  objectPath: string;
  publicUrl: string;
};

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "zenx-lotes";
  return { url, serviceRoleKey, bucket };
}

export function isSupabaseStorageConfigured() {
  const config = getConfig();
  return Boolean(config.url && config.serviceRoleKey && config.bucket);
}

export async function uploadPublicBufferToSupabase(
  body: Buffer,
  objectPath: string,
  contentType: string
): Promise<UploadResult> {
  const { url, serviceRoleKey, bucket } = getConfig();
  if (!url || !serviceRoleKey) throw new Error("Supabase não configurado.");

  const cleanObjectPath = objectPath.replace(/^\/+/, "");
  const endpoint = `${url}/storage/v1/object/${bucket}/${cleanObjectPath}`;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "PUT",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: new Uint8Array(body),
      });
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error("Falha de rede ao enviar arquivo para o Supabase Storage.");
      if (attempt === 2) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      continue;
    }

    if (res.ok) {
      return {
        objectPath: cleanObjectPath,
        publicUrl: `${url}/storage/v1/object/public/${bucket}/${cleanObjectPath}`,
      };
    }

    const responseBody = await res.text().catch(() => "");
    lastError = new Error(
      `Supabase Storage rejeitou o upload (HTTP ${res.status})${responseBody ? `: ${responseBody.slice(0, 500)}` : "."}`
    );
    if (res.status < 500 && res.status !== 429) throw lastError;

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }

  throw lastError ?? new Error("Falha ao enviar arquivo para o Supabase Storage.");
}

export async function uploadPublicFileToSupabase(filePath: string, objectPath: string): Promise<UploadResult> {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".mp4" ? "video/mp4" : "application/octet-stream";
  const body = await readFile(filePath);
  return uploadPublicBufferToSupabase(body, objectPath, contentType);
}
