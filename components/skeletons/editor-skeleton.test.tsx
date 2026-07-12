import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorSkeleton } from "@/components/skeletons/editor-skeleton";

describe("EditorSkeleton", () => {
  it("renders the stat row and the video card grid", () => {
    render(<EditorSkeleton />);
    const root = screen.getByTestId("editor-skeleton");
    expect(root.querySelectorAll(".animate-pulse")).toHaveLength(9);
  });
});
