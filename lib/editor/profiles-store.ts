"use client";

import { useSyncExternalStore } from "react";
import { MOCK_PROFILES } from "./mock-profiles";
import type { Profile } from "./types";

const STORAGE_KEY = "zenx-editor-profiles";
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedProfiles: Profile[] = MOCK_PROFILES;

function parseProfiles(raw: string | null): Profile[] {
  if (!raw) return MOCK_PROFILES;
  try {
    const parsed = JSON.parse(raw) as Profile[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : MOCK_PROFILES;
  } catch {
    return MOCK_PROFILES;
  }
}

/** Memoized snapshot: only re-parses (and returns a new reference) when the
 *  stored value actually changed, so useSyncExternalStore doesn't re-render
 *  on every read. */
function getSnapshot(): Profile[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedProfiles = parseProfiles(raw);
  }
  return cachedProfiles;
}

function getServerSnapshot(): Profile[] {
  return MOCK_PROFILES;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function writeProfiles(profiles: Profile[]) {
  cachedProfiles = profiles;
  cachedRaw = JSON.stringify(profiles);
  window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  listeners.forEach((listener) => listener());
}

/**
 * Perfis do Editor em massa, persistidos no navegador (sem backend ainda).
 * Configurações e Editor em massa compartilham a mesma fonte, então editar
 * um perfil ali já reflete no próximo lote criado.
 */
export function useProfiles(): [Profile[], (next: Profile[] | ((current: Profile[]) => Profile[])) => void] {
  const profiles = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setProfiles(next: Profile[] | ((current: Profile[]) => Profile[])) {
    const resolved = typeof next === "function" ? next(getSnapshot()) : next;
    writeProfiles(resolved);
  }

  return [profiles, setProfiles];
}

export function createBlankProfile(): Profile {
  return {
    id: crypto.randomUUID(),
    name: "Novo perfil",
    handle: "@novoperfil",
    avatarColor: "#6C7BFF",
    watermarkLabel: "NP",
    verified: false,
    editorialTone: "Tom neutro",
    watermarkDefaults: undefined,
    reactionMedia: [],
  };
}
