import { ProfileAvatar } from "./profile-avatar";
import { TEMPLATE_LABELS, type EditorTemplate, type Profile } from "@/lib/editor/types";

const TEMPLATE_ORDER: EditorTemplate[] = ["react", "twitter-style", "shop-content"];

export function ProfilePicker({
  profiles,
  value,
  onChange,
}: {
  profiles: Profile[];
  value: string | null;
  onChange: (profileId: string) => void;
}) {
  const groups = TEMPLATE_ORDER.map((template) => ({
    template,
    profiles: profiles.filter((p) => p.template === template),
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
        <div key={group.template}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {TEMPLATE_LABELS[group.template]}
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
                    {profile.template === "twitter-style" ? profile.handle : TEMPLATE_LABELS[profile.template]}
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
