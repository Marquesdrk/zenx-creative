import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PerformanceSkeleton } from "@/components/skeletons/performance-skeleton";

describe("PerformanceSkeleton", () => {
  it("renders the KPI row and a chart placeholder", () => {
    render(<PerformanceSkeleton />);
    const root = screen.getByTestId("performance-skeleton");
    expect(root.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });
});
