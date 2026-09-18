import type { ReactNode } from "react";
import { SidebarContainer } from "@/components/shell/sidebar-container";
import { BatchDraftsProvider } from "@/components/editor/batch-drafts-provider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen">
      <SidebarContainer />
      <BatchDraftsProvider>
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 xl:px-8 2xl:px-10">{children}</main>
      </BatchDraftsProvider>
    </div>
  );
}
