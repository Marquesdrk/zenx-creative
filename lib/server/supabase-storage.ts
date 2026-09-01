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

export async function uploadPublicFileToSupabase(filePath: string, objectPath: string): Promise<UploadResult> {
  const { url, serviceRoleKey, bucket } = getConfig();
  if (!url || !serviceRoleKey) throw new Error("Supabase não configurado.");

  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".mp4" ? "video/mp4" : "application/octet-stream";
  const body = await readFile(filePath);
  const cleanObjectPath = objectPath.replace(/^\/+/, "");
  const endpoint = `${url}/storage/v1/object/${bucket}/${cleanObjectPath}`;
  const res = await fetch(endpoint, {
    method: "PUT",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body,
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || "Falha ao enviar arquivo para o Supabase Storage.");
  }

  return {
    objectPath: cleanObjectPath,
    publicUrl: `${url}/storage/v1/object/public/${bucket}/${cleanObjectPath}`,
  };
}
