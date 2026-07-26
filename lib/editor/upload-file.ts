/** Envia um arquivo para o servidor e retorna a URL pública (`/uploads/...`), persistida no
 *  perfil/lote em vez de um object URL efêmero que se perde ao recarregar a página. */
export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new Error("Falha ao enviar arquivo");
  const data = (await res.json()) as { url: string };
  return data.url;
}
