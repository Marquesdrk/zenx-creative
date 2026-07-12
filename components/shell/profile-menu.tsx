"use client";

import { useEffect, useRef, useState } from "react";
import { CircleUserRound, Settings, LogOut } from "lucide-react";

export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left hover:bg-card-hover"
      >
        <CircleUserRound size={28} className="text-accent" />
        <span className="flex flex-col">
          <span className="text-sm font-medium text-white">Zenx Creative</span>
          <span className="text-xs text-muted">Uso pessoal</span>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-10 mb-2 w-full rounded-xl border border-border bg-[#141414] p-1 shadow-lg"
        >
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-card-hover"
          >
            <Settings size={16} />
            Configurações
          </button>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-card-hover"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
