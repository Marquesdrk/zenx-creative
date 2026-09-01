import Link from "next/link";
import type { NavItem } from "./nav-items";

export function SidebarNavItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      data-active={isActive}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
        isActive
          ? "bg-gradient-to-r from-accent/35 to-accent-2/15 text-white shadow-[0_10px_30px_rgba(79,70,255,0.18)]"
          : "text-muted hover:bg-white/[0.04] hover:text-foreground"
      }`}
    >
      <Icon size={18} className={isActive ? "text-[#9B8CFF]" : undefined} />
      {item.label}
    </Link>
  );
}
