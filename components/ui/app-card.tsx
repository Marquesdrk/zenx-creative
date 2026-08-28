import type { ReactNode } from "react";

export function AppCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card shadow-[0_18px_70px_rgba(0,0,0,0.28)] ${className}`}>
      {children}
    </div>
  );
}
