import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BibliotecaSkeleton } from "@/components/skeletons/biblioteca-skeleton";

describe("BibliotecaSkeleton", () => {
  it("renders a grid of video card placeholders", () => {
    render(<BibliotecaSkeleton />);
    const root = screen.getByTestId("biblioteca-skeleton");
    expect(root.querySelectorAll(".animate-pulse")).toHaveLength(8);
  });
});
