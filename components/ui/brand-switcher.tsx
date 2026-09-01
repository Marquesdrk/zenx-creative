"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type BrandOption = {
  id: string;
  name: string;
  handle?: string;
  status?: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function BrandSwitcher({
  brands,
  value,
  onChange,
  allowAll = false,
}: {
  brands: BrandOption[];
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const all = allowAll ? [{ id: "ALL", name: "Todas as marcas", handle: "visão agregada" }, ...brands] : brands;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return all;
    return all.filter((brand) => `${brand.name} ${brand.handle ?? ""}`.toLowerCase().includes(normalized));
  }, [allowAll, brands, query]);
  const selected = options.find((brand) => brand.id === value) ?? brands[0] ?? { id: "ALL", name: "Todas as marcas" };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-w-[220px] items-center gap-3 rounded-lg border border-border bg-[#101014] p-3 text-left transition hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white">
          {initials(selected.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{selected.name}</span>
          <span className="block truncate text-xs text-muted">{selected.handle ?? "marca atual"}</span>
        </span>
        <ChevronDown size={16} className="text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[320px] rounded-lg border border-border bg-[#101014] p-2 shadow-2xl">
          <label className="relative block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar marca..."
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted"
            />
          </label>
          <div className="mt-2 max-h-72 overflow-y-auto">
            {options.map((brand) => (
              <button
                key={brand.id}
                type="button"
                onClick={() => {
                  onChange(brand.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/[0.04]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/25 text-xs font-bold text-white">
                  {initials(brand.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{brand.name}</span>
                  <span className="block truncate text-xs text-muted">{brand.handle ?? brand.status ?? "ativa"}</span>
                </span>
                {brand.id === value && <Check size={15} className="text-[#9B8CFF]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
