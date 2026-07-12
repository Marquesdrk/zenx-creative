import {
  SquarePen,
  CalendarDays,
  PlaySquare,
  BarChart3,
  CircleUserRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Editor em massa", href: "/editor", icon: SquarePen },
  { label: "Calendário", href: "/calendario", icon: CalendarDays },
  { label: "Biblioteca", href: "/biblioteca", icon: PlaySquare },
  { label: "Performance", href: "/performance", icon: BarChart3 },
  { label: "Criador de Avatar", href: "/criador-avatar", icon: CircleUserRound },
];
