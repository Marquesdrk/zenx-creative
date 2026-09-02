"use client";

import { useSyncExternalStore } from "react";
import { MOCK_PROFILES } from "./mock-profiles";
import { DEFAULT_X_STYLE_LAYOUT, type Engine, type Profile } from "./types";

// Antes vivia só no localStorage (não sincronizava entre navegadores/máquinas — ver
// lib/server/editor-store-db.ts para o porquê da migração). Agora busca/persiste via
// /api/profiles (Supabase); a interface do hook não muda, só a fonte da verdade.

let cache: Profile[] | null = null;
const listeners = new Set<() => void>();
let fetchStarted = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function ensureHydrated() {
  if (fetchStarted) return;
  fetchStarted = true;
  fetch("/api/profiles")
    .then((res) => res.json())
    .then((data: Profile[]) => {
      cache = Array.isArray(data) && data.length > 0 ? data : MOCK_PROFILES;
      notify();
    })
    .catch(() => {
      cache = MOCK_PROFILES;
      notify();
    });
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
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void fetch("/api/profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profiles),
    });
  }, 500);
}

/**
 * Perfis do Editor em massa, persistidos no Supabase — compartilhados entre qualquer
 * navegador/máquina em que você usar o Zenx (editar um perfil aqui já reflete no próximo lote
 * criado em qualquer lugar).
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
