import Link from "next/link";
import type { NavItem } from "./nav-items";

export function SidebarNavItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      data-active={isActive}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
        isActive
          ? "bg-card-hover text-accent"
          : "text-gray-300 hover:bg-card-hover hover:text-foreground"
      }`}
    >
      <Icon size={18} />
      {item.label}
    </Link>
  );
}
