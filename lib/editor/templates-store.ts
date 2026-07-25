"use client";

import { useSyncExternalStore } from "react";
import { MOCK_TEMPLATES } from "./mock-templates";
import type { Engine, Template } from "./types";

const STORAGE_KEY = "zenx-editor-templates-v1";
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedTemplates: Template[] = MOCK_TEMPLATES;

function parseTemplates(raw: string | null): Template[] {
  if (!raw) return MOCK_TEMPLATES;
  try {
    const parsed = JSON.parse(raw) as Template[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : MOCK_TEMPLATES;
  } catch {
    return MOCK_TEMPLATES;
  }
}

function getSnapshot(): Template[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedTemplates = parseTemplates(raw);
  }
  return cachedTemplates;
}

function getServerSnapshot(): Template[] {
  return MOCK_TEMPLATES;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function writeTemplates(templates: Template[]) {
  cachedTemplates = templates;
  cachedRaw = JSON.stringify(templates);
  window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  listeners.forEach((listener) => listener());
}

/**
 * Templates do Editor em massa (fase 2 — antes ficavam embutidos no próprio perfil).
 * Cada perfil aponta para um via `templateId`. Hoje é sempre 1:1 (cada perfil cria o
 * próprio template ao ser criado), mas o modelo já suporta vários perfis reaproveitando
 * o mesmo template — isso fica para uma fase futura de UI. Sem backend/versionamento
 * ainda (template_versions depende de um banco real).
 */
export function useTemplates(): [
  Template[],
  (next: Template[] | ((current: Template[]) => Template[])) => void,
] {
  const templates = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setTemplates(next: Template[] | ((current: Template[]) => Template[])) {
    const resolved = typeof next === "function" ? next(getSnapshot()) : next;
    writeTemplates(resolved);
  }

  return [templates, setTemplates];
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
