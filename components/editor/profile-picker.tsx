import type { Profile } from "@/lib/editor/types";

export function ProfilePicker({
  profiles,
  value,
  onChange,
}: {
  profiles: Profile[];
  value: string | null;
  onChange: (profileId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {profiles.map((profile) => (
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
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-background"
            style={{ backgroundColor: profile.avatarColor }}
          >
            {profile.watermarkLabel}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{profile.name}</p>
            <p className="truncate text-xs text-muted">{profile.handle}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
