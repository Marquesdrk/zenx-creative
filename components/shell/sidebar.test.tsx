import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sidebar } from "@/components/shell/sidebar";

describe("Sidebar", () => {
  it("renders all five navigation items with correct links", () => {
    render(<Sidebar activeHref="/editor" profile={<div />} />);

    expect(screen.getByRole("link", { name: "Editor em massa" })).toHaveAttribute(
      "href",
      "/editor"
    );
    expect(screen.getByRole("link", { name: "Calendário" })).toHaveAttribute(
      "href",
      "/calendario"
    );
    expect(screen.getByRole("link", { name: "Biblioteca" })).toHaveAttribute(
      "href",
      "/biblioteca"
    );
    expect(screen.getByRole("link", { name: "Performance" })).toHaveAttribute(
      "href",
      "/performance"
    );
    expect(screen.getByRole("link", { name: "Criador de Avatar" })).toHaveAttribute(
      "href",
      "/criador-avatar"
    );
  });

  it("marks only the item matching activeHref as active", () => {
    render(<Sidebar activeHref="/biblioteca" profile={<div />} />);

    expect(screen.getByRole("link", { name: "Biblioteca" })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByRole("link", { name: "Editor em massa" })).toHaveAttribute(
      "data-active",
      "false"
    );
  });

  it("renders the given profile slot below the navigation", () => {
    render(<Sidebar activeHref="/editor" profile={<div data-testid="mock-profile" />} />);
    expect(screen.getByTestId("mock-profile")).toBeInTheDocument();
  });
});
