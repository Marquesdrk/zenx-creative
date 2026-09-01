"use client";

import { useSyncExternalStore } from "react";
import { MOCK_PROFILES } from "./mock-profiles";
import { DEFAULT_X_STYLE_LAYOUT, type Engine, type Profile } from "./types";

const STORAGE_KEY = "zenx-creative:editor:profiles:v1";

let cache: Profile[] | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function readStoredProfiles(): Profile[] {
  if (typeof window === "undefined") return MOCK_PROFILES;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return MOCK_PROFILES;
  try {
    const parsed = JSON.parse(stored) as Profile[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : MOCK_PROFILES;
  } catch {
    return MOCK_PROFILES;
  }
}

function ensureHydrated() {
  if (cache !== null) return;
  cache = readStoredProfiles();
  notify();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  ensureHydrated();
  return () => listeners.delete(onStoreChange);
}

function getSnapshot(): Profile[] | null {
  return cache;
}

function getServerSnapshot(): Profile[] | null {
  return null;
}

function persist(profiles: Profile[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

/**
 * Perfis do Editor em massa, persistidos localmente no navegador de cada máquina.
 * Configurações e Editor em massa compartilham a mesma fonte, então editar um perfil ali
 * já reflete no próximo lote criado naquela máquina.
 */
export function useProfiles(): [Profile[], (next: Profile[] | ((current: Profile[]) => Profile[])) => void] {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setProfiles(next: Profile[] | ((current: Profile[]) => Profile[])) {
    const resolved = typeof next === "function" ? next(cache ?? []) : next;
    cache = resolved;
    notify();
    persist(resolved);
  }

  return [snapshot ?? [], setProfiles];
}

/** `templateId` deve apontar para um Template já criado (ver lib/editor/templates-store.ts) —
 *  perfil e template são criados juntos, nunca um sem o outro. */
export function createBlankProfile(engine: Engine, templateId: string): Profile {
  const id = crypto.randomUUID();
  switch (engine) {
    case "REACT":
      return { id, name: "Novo perfil React", engine, templateId, reactionMedia: [] };
    case "X_STYLE":
      return {
        id,
        name: "Novo perfil X Style",
        engine,
        templateId,
        handle: "@novoperfil",
        avatarUrl: null,
        verified: false,
        editorialTone: "Tom neutro",
        backgroundImageUrl: null,
        defaultTitle: "Título do vídeo",
        xStyleLayout: DEFAULT_X_STYLE_LAYOUT,
      };
    case "UGC":
      return {
        id,
        name: "Novo perfil UGC",
        engine,
        templateId,
        watermarkImageUrl: null,
      };
  }
}
