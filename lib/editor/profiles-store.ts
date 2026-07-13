"use client";

import { useSyncExternalStore } from "react";
import { MOCK_PROFILES } from "./mock-profiles";
import type { EditorTemplate, Profile } from "./types";

// v2: profiles are now scoped to a single template (react/twitter-style/shop-content),
// which is incompatible with the v1 shape — bump the key so old stored data is ignored.
const STORAGE_KEY = "zenx-editor-profiles-v2";
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

export function createBlankProfile(template: EditorTemplate): Profile {
  const id = crypto.randomUUID();
  switch (template) {
    case "react":
      return { id, name: "Novo perfil React", template, reactionMedia: [] };
    case "twitter-style":
      return {
        id,
        name: "Novo perfil X Style",
        template,
        handle: "@novoperfil",
        avatarUrl: null,
        verified: false,
        editorialTone: "Tom neutro",
      };
    case "shop-content":
      return {
        id,
        name: "Novo perfil Shop/Content",
        template,
        watermarkImageUrl: null,
        watermarkDefaults: undefined,
      };
  }
}
