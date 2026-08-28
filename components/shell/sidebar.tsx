import Image from "next/image";
import type { ReactNode } from "react";
import { Zap } from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { SidebarNavItem } from "./sidebar-nav-item";

export function Sidebar({
  activeHref,
  profile,
}: {
  activeHref: string;
  profile: ReactNode;
}) {
  return (
    <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col border-r border-border bg-[#09090B]/95 px-4 py-6">
      <div className="px-2 pb-8">
        <Image src="/logo-zenx.png" alt="Zenx Creative" width={1254} height={1254} className="h-14 w-24 object-contain object-left" priority />
      </div>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Navegação principal">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.href} item={item} isActive={activeHref === item.href} />
        ))}
      </nav>
      <div className="mt-auto space-y-4 pt-4">
        <div className="rounded-lg border border-border bg-card/70 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">Armazenamento</span>
            <span className="text-muted">45%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full w-[45%] rounded-full bg-gradient-to-r from-accent to-accent-2" />
          </div>
          <div className="mt-3 flex justify-between text-[11px] text-muted">
            <span>45% utilizado</span>
            <span>22.5 GB / 50 GB</span>
          </div>
        </div>
        <div className="rounded-lg border border-accent/25 bg-gradient-to-br from-accent/20 to-accent-2/10 p-4">
          <Zap size={18} className="text-[#9B8CFF]" />
          <p className="mt-4 text-sm font-semibold text-[#A99DFF]">Dica de produtividade</p>
          <p className="mt-3 text-xs leading-5 text-[#BEB7FF]">Use templates para agilizar ainda mais seu processo.</p>
          <a href="/configuracoes" className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white">
            Ver templates
          </a>
        </div>
        {profile}
      </div>
    </aside>
  );
}
