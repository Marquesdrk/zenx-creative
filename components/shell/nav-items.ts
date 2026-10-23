import {
  SquarePen,
  CalendarDays,
  BarChart3,
  CircleUserRound,
  Link2,
  Send,
  Settings,
  LayoutTemplate,
  type LucideIcon,
  ClipboardList,
  Download,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Editor em massa", href: "/editor", icon: SquarePen },
  { label: "Publicar", href: "/publicar", icon: Send },
  { label: "Calendário", href: "/calendario", icon: CalendarDays },
  { label: "Contas conectadas", href: "/contas-meta", icon: Link2 },
  { label: "Baixar vídeos", href: "/baixar-videos", icon: Download },
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Performance", href: "/performance", icon: BarChart3 },
  { label: "Relatório", href: "/relatorio", icon: ClipboardList },
  { label: "Criador de Avatar", href: "/criador-avatar", icon: CircleUserRound },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];
