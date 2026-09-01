import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/performance",
}));

import { SidebarContainer } from "@/components/shell/sidebar-container";

describe("SidebarContainer", () => {
  it("highlights the nav item matching the current route and renders the profile menu", () => {
    render(<SidebarContainer />);
    expect(screen.getByRole("link", { name: "Performance" })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByText("Zenx Creative")).toBeInTheDocument();
  });
});
