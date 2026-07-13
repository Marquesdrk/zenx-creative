"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { createBlankProfile, useProfiles } from "@/lib/editor/profiles-store";

export default function ConfiguracoesPage() {
  const [profiles, setProfiles] = useProfiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? profiles[0] ?? null;

  function handleAddProfile() {
    const profile = createBlankProfile();
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
        <h1 className="text-2xl font-semibold text-white">Configurações</h1>
        <button
          type="button"
          onClick={handleAddProfile}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background"
        >
          + Novo perfil
        </button>
      </div>
      <p className="mb-8 mt-1 text-sm text-muted">
        Personalize os perfis usados pelo Editor em massa: identidade, marca d&apos;água e mídias
        de reação. As mudanças aqui já valem para o próximo lote criado.
      </p>

      <div className="flex gap-6">
        <div className="flex w-[240px] shrink-0 flex-col gap-2">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => setSelectedId(profile.id)}
              data-active={selectedProfile?.id === profile.id}
              className={`flex items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
                selectedProfile?.id === profile.id
                  ? "border-accent bg-card-hover"
                  : "border-border bg-card hover:bg-card-hover"
              }`}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-background"
                style={{ backgroundColor: profile.avatarColor }}
              >
                {profile.watermarkLabel}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="truncate text-sm font-medium text-white">{profile.name}</span>
                  {profile.verified && (
                    <BadgeCheck size={12} className="shrink-0 text-accent" fill="currentColor" />
                  )}
                </div>
                <p className="truncate text-xs text-muted">{profile.handle}</p>
              </div>
            </button>
          ))}
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
