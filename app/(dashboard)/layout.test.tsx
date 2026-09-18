import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBatchDrafts } from "@/components/editor/batch-drafts-provider";

vi.mock("next/navigation", () => ({
  usePathname: () => "/editor",
}));

import DashboardLayout from "./layout";

function DraftProbe({ page }: { page: "editor" | "settings" }) {
  const { batches, setBatches, fileRefs } = useBatchDrafts();
  return (
    <div>
      {page === "editor" && (
        <button
          onClick={() => {
            setBatches([{ id: "draft-batch", profileId: "profile", engine: "REACT", createdAt: "2026-09-14T00:00:00.000Z" }]);
            fileRefs.set("draft-item", new File(["video"], "clip.mp4", { type: "video/mp4" }));
          }}
        >
          Criar rascunho
        </button>
      )}
      <span data-testid="draft-batch-count">{batches.length}</span>
      <span data-testid="draft-file-count">{fileRefs.size}</span>
    </div>
  );
}

describe("DashboardLayout", () => {
  it("renders the sidebar navigation alongside the page content", () => {
    render(
      <DashboardLayout>
        <div data-testid="page-content">conteúdo</div>
      </DashboardLayout>
    );

    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  it("keeps an unfinished batch and its original files when navigating within the dashboard", () => {
    const { rerender } = render(
      <DashboardLayout>
        <DraftProbe page="editor" />
      </DashboardLayout>
    );

    fireEvent.click(screen.getByRole("button", { name: "Criar rascunho" }));
    rerender(
      <DashboardLayout>
        <DraftProbe page="settings" />
      </DashboardLayout>
    );

    expect(screen.getByTestId("draft-batch-count")).toHaveTextContent("1");
    expect(screen.getByTestId("draft-file-count")).toHaveTextContent("1");
  });
});
