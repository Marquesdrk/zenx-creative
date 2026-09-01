import { ProfileAvatar } from "./profile-avatar";
import { ENGINE_LABELS, type Engine, type Profile } from "@/lib/editor/types";

const ENGINE_ORDER: Engine[] = ["REACT", "X_STYLE", "UGC"];

export function ProfilePicker({
  profiles,
  value,
  onChange,
}: {
  profiles: Profile[];
  value: string | null;
  onChange: (profileId: string) => void;
}) {
  const groups = ENGINE_ORDER.map((engine) => ({
    engine,
    profiles: profiles.filter((p) => p.engine === engine),
  })).filter((group) => group.profiles.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-xs text-muted">
        Nenhum perfil cadastrado ainda. Crie um em Configurações.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.engine}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {ENGINE_LABELS[group.engine]}
          </p>
          <div className="flex flex-col gap-2">
            {group.profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                role="radio"
                aria-checked={value === profile.id}
                onClick={() => onChange(profile.id)}
                className={`flex items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
                  value === profile.id
                    ? "border-accent bg-card-hover"
                    : "border-border bg-card hover:bg-card-hover"
                }`}
              >
                <ProfileAvatar profile={profile} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{profile.name}</p>
                  <p className="truncate text-xs text-muted">
                    {profile.engine === "X_STYLE" ? profile.handle : ENGINE_LABELS[profile.engine]}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
