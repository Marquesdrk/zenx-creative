"use client";

import { useRef, useState } from "react";
import { CloudUpload, Film, HardDrive, X } from "lucide-react";
import { ProfileAvatar } from "./profile-avatar";
import { ProfilePicker } from "./profile-picker";
import { VideoFrame } from "./video-frame";
import { MOCK_DRIVE_FILES } from "@/lib/editor/mock-profiles";
import { ENGINE_LABELS, type Profile } from "@/lib/editor/types";

type Source = "upload" | "drive";

/** `file` é o objeto real (será enviado ao servidor por quem trata o submit); null para
 *  arquivos do Google Drive mockado, que não têm conteúdo de verdade. */
export type BatchSourceFile = { name: string; file: File | null };

const RECENT_PROFILES_KEY = "zenx:batch-recent-profiles";
const SMART_CROP_KEY = "zenx:batch-smart-crop";

function loadSmartCropPreference(): boolean {
  try {
    return window.localStorage.getItem(SMART_CROP_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveSmartCropPreference(enabled: boolean) {
  try {
    window.localStorage.setItem(SMART_CROP_KEY, enabled ? "on" : "off");
  } catch {
    // sem localStorage: usa o padrão (ligado) na próxima vez
  }
}
const MAX_RECENT_PROFILES = 4;

function loadRecentProfileIds(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_PROFILES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function rememberProfile(profileId: string) {
  try {
    const next = [profileId, ...loadRecentProfileIds().filter((id) => id !== profileId)].slice(0, MAX_RECENT_PROFILES);
    window.localStorage.setItem(RECENT_PROFILES_KEY, JSON.stringify(next));
  } catch {
    // sem localStorage (janela privada etc.): só não lembra os recentes
  }
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

export function BatchModal({
  profiles,
  onClose,
  onSubmit,
}: {
  profiles: Profile[];
  onClose: () => void;
  onSubmit: (params: { profileId: string; files: BatchSourceFile[]; smartCrop: boolean }) => void;
}) {
  const [source, setSource] = useState<Source>("upload");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [selectedDriveFiles, setSelectedDriveFiles] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [smartCrop, setSmartCrop] = useState<boolean>(() => loadSmartCropPreference());
  const [recentProfileIds] = useState<string[]>(() => loadRecentProfileIds());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileCount = source === "upload" ? uploadedFiles.length : selectedDriveFiles.length;
  const selectedProfile = profiles.find((p) => p.id === profileId) ?? null;
  const missingReactMedia = selectedProfile?.engine === "REACT" && selectedProfile.reactionMedia.length === 0;
  const canSubmit = fileCount > 0 && selectedProfile !== null && !missingReactMedia;
  const totalSize = uploadedFiles.reduce((sum, file) => sum + file.size, 0);

  function toggleDriveFile(name: string) {
    setSelectedDriveFiles((current) =>
      current.includes(name) ? current.filter((f) => f !== name) : [...current, name]
    );
  }

  function handleSubmit() {
    if (!canSubmit || !selectedProfile) return;
    const files: BatchSourceFile[] =
      source === "upload"
        ? uploadedFiles.map((file) => ({ name: file.name, file }))
        : selectedDriveFiles.map((name) => ({ name, file: null }));
    rememberProfile(selectedProfile.id);
    saveSmartCropPreference(smartCrop);
    onSubmit({ profileId: selectedProfile.id, files, smartCrop });
  }

  const submitLabel = canSubmit
    ? `Importar ${fileCount} vídeo${fileCount === 1 ? "" : "s"}`
    : fileCount === 0
      ? "Selecione os vídeos"
      : selectedProfile === null
        ? "Escolha um perfil"
        : "Cadastre a reação do perfil";

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4 sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-[980px] flex-col overflow-hidden rounded-2xl border border-border bg-[#101010]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Novo lote</h2>
            <p className="mt-0.5 text-xs text-muted">Escolha os vídeos e o perfil que vai receber o lote.</p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-card-hover hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">1 · Vídeos</p>
                <div className="flex gap-1 rounded-lg border border-border bg-card p-0.5">
                  {(
                    [
                      ["upload", "Enviar arquivos"],
                      ["drive", "Google Drive"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSource(value)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                        source === value ? "bg-accent text-background" : "text-gray-300 hover:bg-white/[0.06]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {source === "upload" && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => {
                      setUploadedFiles(Array.from(event.target.files ?? []));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-border py-5 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
                  >
                    <CloudUpload size={22} />
                    {uploadedFiles.length > 0 ? (
                      <span className="font-semibold text-foreground">
                        {uploadedFiles.length} arquivo(s) · {formatSize(totalSize)} — clique para trocar
                      </span>
                    ) : (
                      <span>Clique para selecionar vídeos</span>
                    )}
                  </button>
                  {uploadedFiles.length > 0 && (
                    <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto rounded-lg border border-border bg-card/50 p-2 text-xs text-gray-300">
                      {uploadedFiles.map((file) => (
                        <li key={`${file.name}-${file.size}`} className="flex items-center gap-2">
                          <Film size={12} className="shrink-0 text-muted" />
                          <span className="min-w-0 flex-1 truncate">{file.name}</span>
                          <span className="shrink-0 text-muted">{formatSize(file.size)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    Na revisão, o editor tenta detectar a parte em movimento do vídeo e copiar o texto acima dela para o título do template X Style. Confira o resultado antes de exportar.
                  </p>
                </div>
              )}

              {source === "drive" && (
                <div>
                  {!driveConnected ? (
                    <button
                      type="button"
                      onClick={() => setDriveConnected(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm text-foreground hover:bg-card-hover"
                    >
                      <HardDrive size={16} />
                      Conectar Google Drive
                    </button>
                  ) : (
                    <div>
                      <p className="mb-2 text-xs text-muted">
                        Conectado: <span className="text-foreground">Meus Vídeos/Instagram</span>
                      </p>
                      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                        {MOCK_DRIVE_FILES.map((name) => (
                          <label
                            key={name}
                            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-200"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDriveFiles.includes(name)}
                              onChange={() => toggleDriveFile(name)}
                              className="accent-accent"
                            />
                            {name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card/50 p-3">
                <input
                  type="checkbox"
                  checked={smartCrop}
                  onChange={(event) => setSmartCrop(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                />
                <span className="text-xs text-gray-300">
                  <span className="block text-sm font-semibold text-foreground">Recorte inteligente automático</span>
                  Analisa cada vídeo e remove cabeçalho, legenda e faixas de reposts (cerca de 1 s por vídeo, em segundo plano).
                  Desligue para vídeos que já vêm em tela cheia 9:16 — o lote fica pronto na hora.
                </span>
              </label>
            </section>

            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                2 · Perfil <span className="font-normal normal-case">(define engine e template automaticamente)</span>
              </p>
              <ProfilePicker profiles={profiles} value={profileId} onChange={setProfileId} recentIds={recentProfileIds} />
            </section>
          </div>

          <aside className="lg:sticky lg:top-0 lg:self-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Resumo</p>
            {selectedProfile ? (
              <div className="rounded-xl border border-border bg-card/50 p-3">
                <div className="mb-3 flex items-center gap-3">
                  <ProfileAvatar profile={selectedProfile} className="h-11 w-11" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{selectedProfile.name}</p>
                    <p className="truncate text-xs text-muted">
                      {"handle" in selectedProfile && selectedProfile.handle ? `${selectedProfile.handle} · ` : ""}
                      {ENGINE_LABELS[selectedProfile.engine]}
                    </p>
                  </div>
                </div>
                <div className="mx-auto w-[140px]">
                  <VideoFrame
                    profile={selectedProfile}
                    title={selectedProfile.engine === "X_STYLE" ? selectedProfile.defaultTitle : undefined}
                    caption="Legenda de exemplo"
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-xs text-muted">
                Escolha um perfil para ver a prévia do template.
              </div>
            )}

            {selectedProfile?.engine === "REACT" && (
              <div
                className={`mt-3 rounded-lg border p-3 text-xs ${
                  missingReactMedia
                    ? "border-amber-400/40 bg-amber-400/5 text-amber-200"
                    : "border-accent/30 bg-accent/5 text-gray-300"
                }`}
              >
                {missingReactMedia ? (
                  <>
                    Este perfil React ainda não tem vídeos de reação. Cadastre pelo menos um em
                    <a href="/configuracoes" className="ml-1 font-semibold underline">Configurações</a> antes de importar o lote.
                  </>
                ) : (
                  <>
                    {selectedProfile.reactionMedia.length} vídeo(s) de reação salvo(s). O sistema alternará entre eles
                    automaticamente e unirá a reação na parte superior ao conteúdo importado na parte inferior.
                  </>
                )}
              </div>
            )}
          </aside>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border bg-[#0d0d0d] px-6 py-4">
          <p className="min-w-0 truncate text-xs text-muted">
            {fileCount > 0 ? `${fileCount} vídeo(s)` : "Nenhum vídeo"}
            {selectedProfile ? ` → ${selectedProfile.name}` : ""}
          </p>
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-gray-300 hover:bg-card-hover"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
