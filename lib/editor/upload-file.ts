/** Envia o arquivo para o armazenamento do app e retorna somente a URL persistente.
 *  Guardar o vídeo inteiro como Data URL dentro do JSON do perfil fazia o salvamento
 *  ultrapassar o tamanho do registro e deixava as mídias apenas na tela atual. */
export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch("/api/upload", { method: "POST", body: formData });
  const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error || "Falha ao salvar o arquivo.");
  }
  return payload.url;
}
