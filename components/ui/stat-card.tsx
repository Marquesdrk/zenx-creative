import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  value,
  label,
  tone = "violet",
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  tone?: "violet" | "blue" | "green" | "amber" | "pink";
}) {
  const toneClass = {
    violet: "bg-accent/15 text-[#8B7CFF]",
    blue: "bg-blue-500/15 text-blue-400",
    green: "bg-emerald-500/15 text-emerald-400",
    amber: "bg-amber-500/15 text-amber-400",
    pink: "bg-pink-500/15 text-pink-400",
  }[tone];

  return (
    <div className="rounded-lg border border-border bg-card/90 p-4 shadow-[0_14px_50px_rgba(0,0,0,0.24)]">
      <div className="flex items-center gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${toneClass}`}>
          <Icon size={23} />
        </span>
        <div>
          <div className="text-2xl font-bold leading-7 text-foreground">{value}</div>
          <div className="mt-1 text-xs text-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}
