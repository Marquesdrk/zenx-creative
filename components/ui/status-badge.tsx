import { AlertTriangle, CheckCircle2, Clock3, Loader2, Radio } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StatusTone = "idle" | "working" | "success" | "warning" | "danger";

const TONES: Record<StatusTone, string> = {
  idle: "bg-accent/15 text-[#9B8CFF]",
  working: "bg-blue-500/15 text-blue-300",
  success: "bg-emerald-500/15 text-emerald-300",
  warning: "bg-amber-500/15 text-amber-300",
  danger: "bg-red-500/15 text-red-300",
};

const ICONS: Record<StatusTone, LucideIcon> = {
  idle: Clock3,
  working: Loader2,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
};

export function StatusBadge({
  children,
  tone = "idle",
  pulse = false,
}: {
  children: string;
  tone?: StatusTone;
  pulse?: boolean;
}) {
  const Icon = pulse ? Radio : ICONS[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${TONES[tone]}`}>
      <Icon size={13} className={tone === "working" ? "animate-spin" : undefined} />
      {children}
    </span>
  );
}
