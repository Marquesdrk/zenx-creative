"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_X_STYLE_LAYOUT, type Engine, type Profile } from "./types";

let cache: Profile[] | null = null;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function ensureHydrated() {
  if (cache !== null || hydrating) return;
  hydrating = Promise.resolve()
    .then(() => fetch("/api/profiles"))
    .then((res) => res.json())
    .then((data: Profile[]) => {
      cache = data;
      notify();
    })
    .catch(() => {
      cache = [];
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
  Promise.resolve()
    .then(() =>
      fetch("/api/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profiles),
      })
    )
    .catch(() => {});
}

/**
 * Perfis do Editor em massa, persistidos no servidor (SQLite). Configurações e Editor em
 * massa compartilham a mesma fonte, então editar um perfil ali já reflete no próximo lote
 * criado. A escrita é otimista: atualiza o cache local na hora e sincroniza com o servidor
 * em segundo plano.
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
