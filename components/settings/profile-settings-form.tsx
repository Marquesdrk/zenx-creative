"use client";

import { Trash2 } from "lucide-react";
import { ReactProfileForm } from "./react-profile-form";
import { XStyleProfileForm } from "./x-style-profile-form";
import { UgcProfileForm } from "./ugc-profile-form";
import { ENGINE_LABELS, type Profile } from "@/lib/editor/types";

export function ProfileSettingsForm({
  profile,
  onChange,
  onDelete,
  canDelete,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <label htmlFor={`name-${profile.id}`} className="mb-1 block text-xs text-muted">
            Nome de exibição · <span className="text-accent">{ENGINE_LABELS[profile.engine]}</span>
          </label>
          <input
            id={`name-${profile.id}`}
            value={profile.name}
            onChange={(event) => onChange({ ...profile, name: event.target.value })}
            className="w-full max-w-xs rounded-lg border border-border bg-background p-2 text-sm text-foreground"
          />
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label={`Remover perfil ${profile.name}`}
          className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-gray-400 hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="border-t border-border pt-5">
        {profile.engine === "REACT" && <ReactProfileForm profile={profile} onChange={onChange} />}
        {profile.engine === "X_STYLE" && (
          <XStyleProfileForm profile={profile} onChange={onChange} />
        )}
        {profile.engine === "UGC" && <UgcProfileForm profile={profile} onChange={onChange} />}
      </div>
    </div>
  );
}
