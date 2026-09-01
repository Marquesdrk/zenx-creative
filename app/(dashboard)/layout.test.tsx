import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/editor",
}));

import DashboardLayout from "./layout";

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
});
