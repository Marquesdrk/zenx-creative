/** Guarda o arquivo nas configurações locais do navegador e retorna uma Data URL persistente.
 *  Isso evita depender de escrita em disco/Blob público no deploy da Vercel. */
export async function uploadFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Falha ao ler arquivo local."));
      }
    });
    reader.addEventListener("error", () => reject(new Error("Falha ao ler arquivo local.")));
    reader.readAsDataURL(file);
  });
}
