import type { ReactNode } from "react";
import { SidebarContainer } from "@/components/shell/sidebar-container";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen">
      <SidebarContainer />
      <main className="flex-1 overflow-y-auto px-10 py-8">{children}</main>
    </div>
  );
}
