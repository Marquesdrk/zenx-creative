import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarioSkeleton } from "@/components/skeletons/calendario-skeleton";

describe("CalendarioSkeleton", () => {
  it("renders a 4-week month grid of day cells", () => {
    render(<CalendarioSkeleton />);
    const root = screen.getByTestId("calendario-skeleton");
    expect(root.querySelectorAll(".animate-pulse")).toHaveLength(28);
  });
});
