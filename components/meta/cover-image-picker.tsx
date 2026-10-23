"use client";

import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";

export function CoverImagePicker({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = preview?.file === file ? preview.url : null;

  useEffect(() => {
    const url = preview?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview]);

  function selectFile(nextFile: File) {
    setPreview({ file: nextFile, url: URL.createObjectURL(nextFile) });
    onChange(nextFile);
  }

  function removeFile() {
    setPreview(null);
    onChange(null);
  }

  async function handleSelection(selected: File | undefined) {
    if (!selected) return;
    setError(null);
    const extension = selected.name.split(".").pop()?.toLowerCase();
    const supportedType = selected.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "avif"].includes(extension ?? "");
    if (!supportedType) {
      setError("Escolha uma imagem JPG, PNG, WebP ou AVIF.");
      return;
    }
    if (selected.size > 25 * 1024 * 1024) {
      setError("A imagem original deve ter no máximo 25 MB.");
      return;
    }
    if (selected.type === "image/jpeg" && selected.size <= 4 * 1024 * 1024) {
      selectFile(selected);
      return;
    }

    setPreparing(true);
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(selected);
      const scale = Math.min(1, 1920 / bitmap.width, 1920 / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("O navegador não conseguiu preparar a imagem.");
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      let jpeg: Blob | null = null;
      for (const quality of [0.92, 0.86, 0.8, 0.74, 0.68, 0.62, 0.55]) {
        jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (jpeg && jpeg.size <= 4 * 1024 * 1024) break;
      }
      if (!jpeg || jpeg.type !== "image/jpeg") {
        throw new Error("O navegador não conseguiu converter a capa para JPEG.");
      }
      if (jpeg.size > 4 * 1024 * 1024) {
        throw new Error("A imagem continua acima de 4 MB após a otimização. Reduza as dimensões e tente novamente.");
      }

      const filename = `${selected.name.replace(/\.[^.]+$/, "") || "capa"}.jpg`;
      selectFile(new File([jpeg], filename, { type: "image/jpeg", lastModified: selected.lastModified }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar esta imagem.");
    } finally {
      bitmap?.close();
      setPreparing(false);
    }
  }

  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Capa do vídeo</p>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
        {previewUrl ? <img src={previewUrl} alt="Prévia da capa" className="h-16 w-12 rounded object-cover" /> :
          <span className="flex h-16 w-12 items-center justify-center rounded bg-white/[0.05] text-muted"><ImagePlus size={17} /></span>}
        <div className="min-w-0 flex-1">
          <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-card-hover">
            {preparing ? "Preparando…" : file ? "Trocar capa" : "Escolher imagem"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={preparing} onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; void handleSelection(selected); }} className="sr-only" />
          </label>
          <p className="mt-1 truncate text-[11px] text-muted">{file?.name ?? "Opcional · JPG, PNG, WebP ou AVIF · otimizada para JPEG até 4 MB"}</p>
          {error && <p role="alert" className="mt-1 text-[11px] text-red-300">{error}</p>}
        </div>
        {file && <button type="button" aria-label="Remover capa" onClick={removeFile} className="rounded p-1 text-muted hover:text-foreground"><X size={14} /></button>}
      </div>
    </div>
  );
}
