"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { ProfileAvatar } from "@/components/editor/profile-avatar";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { createBlankProfile, useProfiles } from "@/lib/editor/profiles-store";
import { ENGINE_LABELS, type Engine } from "@/lib/editor/types";

const ENGINE_ORDER: Engine[] = ["REACT", "X_STYLE", "UGC"];

export default function ConfiguracoesPage() {
  const [profiles, setProfiles] = useProfiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? profiles[0] ?? null;

  function handleAddProfile(engine: Engine) {
    const profile = createBlankProfile(engine);
    setProfiles((current) => [...current, profile]);
    setSelectedId(profile.id);
  }

  function handleChangeProfile(updated: (typeof profiles)[number]) {
    setProfiles((current) => current.map((p) => (p.id === updated.id ? updated : p)));
  }

  function handleDeleteProfile(id: string) {
    if (profiles.length <= 1) return;
    setProfiles((current) => current.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <div className="flex gap-2">
          {ENGINE_ORDER.map((engine) => (
            <button
              key={engine}
              type="button"
              onClick={() => handleAddProfile(engine)}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-background"
            >
              + {ENGINE_LABELS[engine]}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-8 mt-1 text-sm text-muted">
        Cada perfil pertence a um engine só, com os campos daquele engine. As mudanças aqui já
        valem para o próximo lote criado.
      </p>

      <div className="flex gap-6">
        <div className="flex w-[240px] shrink-0 flex-col gap-4">
          {ENGINE_ORDER.map((engine) => {
            const group = profiles.filter((p) => p.engine === engine);
            if (group.length === 0) return null;
            return (
              <div key={engine}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {ENGINE_LABELS[engine]}
                </p>
                <div className="flex flex-col gap-2">
                  {group.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setSelectedId(profile.id)}
                      className={`flex items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
                        selectedProfile?.id === profile.id
                          ? "border-accent bg-card-hover"
                          : "border-border bg-card hover:bg-card-hover"
                      }`}
                    >
                      <ProfileAvatar profile={profile} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-medium text-foreground">
                            {profile.name}
                          </span>
                          {profile.engine === "X_STYLE" && profile.verified && (
                            <BadgeCheck size={12} className="shrink-0 text-accent" fill="currentColor" />
                          )}
                        </div>
                        {profile.engine === "X_STYLE" && (
                          <p className="truncate text-xs text-muted">{profile.handle}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex-1">
          {selectedProfile ? (
            <ProfileSettingsForm
              key={selectedProfile.id}
              profile={selectedProfile}
              onChange={handleChangeProfile}
              onDelete={() => handleDeleteProfile(selectedProfile.id)}
              canDelete={profiles.length > 1}
            />
          ) : (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
              Nenhum perfil selecionado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
