import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GridBackground } from "@/components/background/grid-background";

describe("GridBackground", () => {
  it("renders a decorative, non-interactive fixed background layer", () => {
    render(<GridBackground />);
    const el = screen.getByTestId("grid-background");

    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveClass("grid-background");
  });
});
