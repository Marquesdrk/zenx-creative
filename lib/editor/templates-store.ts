"use client";

import { useSyncExternalStore } from "react";
import { MOCK_TEMPLATES } from "./mock-templates";
import type { Engine, Template } from "./types";

const STORAGE_KEY = "zenx-creative:editor:templates:v1";

let cache: Template[] | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function readStoredTemplates(): Template[] {
  if (typeof window === "undefined") return MOCK_TEMPLATES;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return MOCK_TEMPLATES;
  try {
    const parsed = JSON.parse(stored) as Template[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : MOCK_TEMPLATES;
  } catch {
    return MOCK_TEMPLATES;
  }
}

function ensureHydrated() {
  if (cache !== null) return;
  cache = readStoredTemplates();
  notify();
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
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

/**
 * Templates do Editor em massa, persistidos localmente no navegador de cada máquina.
 * Cada perfil aponta para um via `templateId`. Hoje é sempre 1:1 (cada perfil cria
 * o próprio template ao ser criado), mas o modelo já suporta vários perfis reaproveitando
 * o mesmo template.
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
