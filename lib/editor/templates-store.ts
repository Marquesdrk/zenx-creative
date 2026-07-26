"use client";

import { useSyncExternalStore } from "react";
import type { Engine, Template } from "./types";

let cache: Template[] | null = null;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function ensureHydrated() {
  if (cache !== null || hydrating) return;
  hydrating = Promise.resolve()
    .then(() => fetch("/api/templates"))
    .then((res) => res.json())
    .then((data: Template[]) => {
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

function getSnapshot(): Template[] | null {
  return cache;
}

function getServerSnapshot(): Template[] | null {
  return null;
}

function persist(templates: Template[]) {
  Promise.resolve()
    .then(() =>
      fetch("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templates),
      })
    )
    .catch(() => {});
}

/**
 * Templates do Editor em massa, persistidos no servidor (SQLite). Cada perfil aponta para
 * um via `templateId`. Hoje é sempre 1:1 (cada perfil cria o próprio template ao ser
 * criado), mas o modelo já suporta vários perfis reaproveitando o mesmo template.
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
