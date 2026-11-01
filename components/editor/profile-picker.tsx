"use client";

import { useMemo, useState } from "react";
import { Check, Clock, Search } from "lucide-react";
import { ProfileAvatar } from "./profile-avatar";
import { ENGINE_LABELS, type Engine, type Profile } from "@/lib/editor/types";

const ENGINE_ORDER: Engine[] = ["REACT", "X_STYLE", "UGC"];

function profileHandle(profile: Profile) {
  return "handle" in profile && profile.handle ? profile.handle : null;
}

function matches(profile: Profile, query: string) {
  if (!query) return true;
  const haystack = `${profile.name} ${profileHandle(profile) ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function ProfileCard({ profile, selected, onSelect }: { profile: Profile; selected: boolean; onSelect: () => void }) {
  const handle = profileHandle(profile);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`relative flex min-w-0 items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
        selected ? "border-accent bg-accent/10" : "border-border bg-card hover:border-white/20 hover:bg-card-hover"
      }`}
    >
      <ProfileAvatar profile={profile} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{profile.name}</p>
        <p className="truncate text-xs text-muted">{handle ?? ENGINE_LABELS[profile.engine]}</p>
      </div>
      <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-gray-300">
        {ENGINE_LABELS[profile.engine]}
      </span>
      {selected && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-background">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/** Seletor de perfil pensado para muitas contas: busca por nome/@, filtro por engine, grade
 *  rolável e atalho para os últimos perfis usados. */
export function ProfilePicker({
  profiles,
  value,
  onChange,
  recentIds = [],
}: {
  profiles: Profile[];
  value: string | null;
  onChange: (profileId: string) => void;
  recentIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState<Engine | "ALL">("ALL");

  const counts = useMemo(() => {
    const byEngine = new Map<Engine, number>();
    for (const profile of profiles) byEngine.set(profile.engine, (byEngine.get(profile.engine) ?? 0) + 1);
    return byEngine;
  }, [profiles]);

  const availableEngines = ENGINE_ORDER.filter((candidate) => (counts.get(candidate) ?? 0) > 0);

  const filtered = useMemo(
    () =>
      profiles
        .filter((profile) => (engine === "ALL" || profile.engine === engine) && matches(profile, query.trim()))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })),
    [profiles, engine, query]
  );

  const recents = recentIds
    .map((id) => profiles.find((profile) => profile.id === id))
    .filter((profile): profile is Profile => Boolean(profile))
    .slice(0, 4);

  if (profiles.length === 0) {
    return <p className="text-xs text-muted">Nenhum perfil cadastrado ainda. Crie um em Configurações.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Buscar entre ${profiles.length} perfis…`}
            aria-label="Buscar perfil"
            className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </label>
        {availableEngines.length > 1 && (
          <div className="flex gap-1 rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Filtrar por engine">
            {(["ALL", ...availableEngines] as const).map((option) => {
              const active = engine === option;
              const count = option === "ALL" ? profiles.length : (counts.get(option) ?? 0);
              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setEngine(option)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    active ? "bg-accent text-background" : "text-gray-300 hover:bg-white/[0.06]"
                  }`}
                >
                  {option === "ALL" ? "Todos" : ENGINE_LABELS[option]} <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {recents.length > 0 && !query && engine === "ALL" && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <Clock size={11} /> Usados recentemente
          </p>
          <div className="flex flex-wrap gap-2">
            {recents.map((profile) => {
              const selected = value === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => onChange(profile.id)}
                  aria-label={`Usar ${profile.name}`}
                  className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-medium transition-colors ${
                    selected ? "border-accent bg-accent/10 text-foreground" : "border-border bg-card text-gray-200 hover:bg-card-hover"
                  }`}
                >
                  <ProfileAvatar profile={profile} className="h-6 w-6" />
                  <span className="max-w-[140px] truncate">{profile.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        role="radiogroup"
        aria-label="Perfil do lote"
        className="grid max-h-[320px] grid-cols-1 gap-2 overflow-y-auto pr-1 pt-1.5 sm:grid-cols-2"
      >
        {filtered.map((profile) => (
          <ProfileCard key={profile.id} profile={profile} selected={value === profile.id} onSelect={() => onChange(profile.id)} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
            Nenhum perfil encontrado{query ? ` para “${query}”` : ""}.
          </p>
        )}
      </div>
      {filtered.length > 0 && (
        <p className="text-[11px] text-muted">
          {filtered.length === profiles.length ? `${profiles.length} perfis` : `${filtered.length} de ${profiles.length} perfis`}
        </p>
      )}
    </div>
  );
}
