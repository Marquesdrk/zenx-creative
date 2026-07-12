import Image from "next/image";
import type { ReactNode } from "react";
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
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-border px-3 py-6">
      <div className="px-2 pb-8">
        <Image src="/logo-zenx.png" alt="Zenx Creative" width={1254} height={1254} className="h-12 w-12" priority />
      </div>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Navegação principal">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.href} item={item} isActive={activeHref === item.href} />
        ))}
      </nav>
      <div className="mt-auto pt-4">{profile}</div>
    </aside>
  );
}
