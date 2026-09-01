import type { ReactNode } from "react";
import { SidebarContainer } from "@/components/shell/sidebar-container";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen">
      <SidebarContainer />
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 xl:px-8 2xl:px-10">{children}</main>
    </div>
  );
}
