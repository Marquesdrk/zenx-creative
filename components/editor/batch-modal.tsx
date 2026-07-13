"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { ProfilePicker } from "./profile-picker";
import { TemplatePicker } from "./template-picker";
import { MOCK_DRIVE_FILES } from "@/lib/editor/mock-profiles";
import type { EditorTemplate, Profile } from "@/lib/editor/types";

type Source = "upload" | "drive";

export type BatchSourceFile = { name: string; url: string | null };

export function BatchModal({
  profiles,
  onClose,
  onSubmit,
}: {
  profiles: Profile[];
  onClose: () => void;
  onSubmit: (params: {
    profileId: string;
    template: EditorTemplate;
    files: BatchSourceFile[];
  }) => void;
}) {
  const [source, setSource] = useState<Source>("upload");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [selectedDriveFiles, setSelectedDriveFiles] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [template, setTemplate] = useState<EditorTemplate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileCount = source === "upload" ? uploadedFiles.length : selectedDriveFiles.length;
  const previewProfile = profiles.find((p) => p.id === profileId) ?? profiles[0];
  const canSubmit = fileCount > 0 && profileId !== null && template !== null;

  function toggleDriveFile(name: string) {
    setSelectedDriveFiles((current) =>
      current.includes(name) ? current.filter((f) => f !== name) : [...current, name]
    );
  }

  function handleSubmit() {
    if (!canSubmit || !profileId || !template) return;
    const files: BatchSourceFile[] =
      source === "upload"
        ? uploadedFiles.map((file) => ({ name: file.name, url: URL.createObjectURL(file) }))
        : selectedDriveFiles.map((name) => ({ name, url: null }));
    onSubmit({ profileId, template, files });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-6">
      <div className="flex max-h-[85vh] w-[560px] flex-col gap-5 overflow-y-auto rounded-2xl border border-border bg-[#101010] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Novo lote</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-card-hover hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Fonte</p>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setSource("upload")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                source === "upload" ? "bg-accent text-background" : "bg-card text-gray-300"
              }`}
            >
              Enviar arquivos
            </button>
            <button
              type="button"
              onClick={() => setSource("drive")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                source === "drive" ? "bg-accent text-background" : "bg-card text-gray-300"
              }`}
            >
              Google Drive
            </button>
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
                className="w-full rounded-xl border border-dashed border-border py-6 text-sm text-muted hover:border-accent hover:text-white"
              >
                {uploadedFiles.length > 0
                  ? `${uploadedFiles.length} arquivo(s) selecionado(s)`
                  : "Clique para selecionar vídeos"}
              </button>
            </div>
          )}

          {source === "drive" && (
            <div>
              {!driveConnected ? (
                <button
                  type="button"
                  onClick={() => setDriveConnected(true)}
                  className="w-full rounded-xl border border-border bg-card py-2 text-sm text-white hover:bg-card-hover"
                >
                  Conectar Google Drive
                </button>
              ) : (
                <div>
                  <p className="mb-2 text-xs text-muted">
                    Conectado: <span className="text-white">Meus Vídeos/Instagram</span>
                  </p>
                  <div className="flex flex-col gap-1">
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
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Perfil</p>
          <ProfilePicker profiles={profiles} value={profileId} onChange={setProfileId} />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Template</p>
          <TemplatePicker value={template} previewProfile={previewProfile} onChange={setTemplate} />
        </div>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="mt-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          Importar
        </button>
      </div>
    </div>
  );
}
