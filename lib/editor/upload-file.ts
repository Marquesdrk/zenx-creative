const MAX_OPTIMIZED_BYTES = 4 * 1024 * 1024;

/** Padroniza artes de perfil para a resolução de saída antes do upload. Além de preservar
 *  transparência, WebP reduz bastante o tamanho de templates PNG/JPG muito pesados. */
async function optimizeProfileImage(file: File): Promise<File> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const supportedType = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "avif"].includes(extension ?? "");
  if (!supportedType) {
    throw new Error("Escolha uma imagem JPG, PNG, WebP ou AVIF.");
  }

  if (file.size > 25 * 1024 * 1024) {
    throw new Error("A imagem original deve ter no máximo 25 MB.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível ler essa imagem. Converta para JPG, PNG ou WebP e tente novamente.");
  }

  try {
    const scale = Math.min(1, 1920 / bitmap.width, 1920 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem no navegador.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.9, 0.82, 0.72, 0.62]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob || blob.type !== "image/webp") {
        throw new Error("Seu navegador não conseguiu converter a imagem. Tente usar JPG, PNG ou WebP.");
      }
      if (blob.size <= MAX_OPTIMIZED_BYTES || quality === 0.62) {
        if (blob.size > MAX_OPTIMIZED_BYTES) {
          throw new Error("A imagem ainda ficou muito grande após a otimização. Reduza as dimensões e tente novamente.");
        }
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "imagem"}.webp`, {
          type: "image/webp",
          lastModified: file.lastModified,
        });
      }
    }
    throw new Error("Não foi possível otimizar essa imagem.");
  } finally {
    bitmap.close();
  }
}

/** Envia o arquivo para o armazenamento do app e retorna somente a URL persistente.
 *  Guardar o vídeo inteiro como Data URL dentro do JSON do perfil fazia o salvamento
 *  ultrapassar o tamanho do registro e deixava as mídias apenas na tela atual. */
export async function uploadFile(file: File): Promise<string> {
  const optimizedFile = await optimizeProfileImage(file);
  const formData = new FormData();
  formData.append("file", optimizedFile, optimizedFile.name);

  const response = await fetch("/api/upload", { method: "POST", body: formData });
  const responseText = await response.text();
  let payload: { url?: string; error?: string } | null = null;
  try {
    payload = JSON.parse(responseText) as { url?: string; error?: string };
  } catch {
    // Next/proxy errors can be plain text or HTML instead of the route's JSON response.
  }
  if (!response.ok || !payload?.url) {
    const serverMessage = payload?.error ?? responseText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
    throw new Error(serverMessage || `Falha ao salvar o arquivo (HTTP ${response.status}).`);
  }
  return payload.url;
}
