"use client";

import { useSyncExternalStore } from "react";
import { MOCK_TEMPLATES } from "./mock-templates";
import type { Engine, Template } from "./types";

// Antes vivia só no localStorage (não sincronizava entre navegadores/máquinas — ver
// lib/server/editor-store-db.ts para o porquê da migração). Agora busca/persiste via
// /api/templates (Supabase); a interface do hook não muda, só a fonte da verdade.

let cache: Template[] | null = null;
const listeners = new Set<() => void>();
let fetchStarted = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function ensureHydrated() {
  if (fetchStarted) return;
  fetchStarted = true;
  fetch("/api/templates")
    .then((res) => res.json())
    .then((data: Template[]) => {
      cache = Array.isArray(data) && data.length > 0 ? data : MOCK_TEMPLATES;
      notify();
    })
    .catch(() => {
      cache = MOCK_TEMPLATES;
      notify();
    });
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  ensureHydrated();
  return () => listeners.delete(onStoreChange);
}

function getSnapshot(): Template[] | null {
  return cache;
}

function getServerSnapshot(): Template[] | null {
  return null;
}

function persist(templates: Template[]) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void fetch("/api/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(templates),
    });
  }, 500);
}

/**
 * Templates do Editor em massa, persistidos no Supabase — compartilhados entre qualquer
 * navegador/máquina em que você usar o Zenx. Cada perfil aponta para um via `templateId`.
 */
export function useTemplates(): [
  Template[],
  (next: Template[] | ((current: Template[]) => Template[])) => void,
] {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setTemplates(next: Template[] | ((current: Template[]) => Template[])) {
    const resolved = typeof next === "function" ? next(cache ?? []) : next;
    cache = resolved;
    notify();
    persist(resolved);
  }

  return [snapshot ?? [], setTemplates];
}

export function createDefaultTemplate(engine: Engine, name: string): Template {
  const id = crypto.randomUUID();
  switch (engine) {
    case "REACT":
      return { id, engine, name };
    case "X_STYLE":
      return { id, engine, name };
    case "UGC":
      return { id, engine, name, watermarkDefaults: undefined };
  }
}
