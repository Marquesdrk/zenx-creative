"use client";

import { Bell, Command, Search } from "lucide-react";
import type { ReactNode } from "react";

export function Topbar({
  searchPlaceholder = "Buscar vídeos...",
  action,
}: {
  searchPlaceholder?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-center justify-end gap-3">
      <label className="relative hidden w-full max-w-[330px] items-center lg:flex">
        <Search size={16} className="pointer-events-none absolute left-3 text-muted" />
        <input
          type="search"
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-lg border border-border bg-card/80 pl-10 pr-20 text-sm text-foreground placeholder:text-muted/80 transition focus:border-accent/70"
        />
        <span className="pointer-events-none absolute right-9 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted">
          CTRL
        </span>
        <span className="pointer-events-none absolute right-3 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted">
          K
        </span>
      </label>
      <button
        type="button"
        aria-label="Notificações"
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card/80 text-muted transition hover:bg-card-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Bell size={17} />
      </button>
      <button
        type="button"
        aria-label="Abrir busca rápida"
        className="hidden h-10 w-10 items-center justify-center rounded-lg border border-border bg-card/80 text-muted transition hover:bg-card-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent md:flex lg:hidden"
      >
        <Command size={16} />
      </button>
      {action}
    </div>
  );
}
