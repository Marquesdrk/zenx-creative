import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkeletonBlock } from "@/components/skeletons/skeleton-block";

describe("SkeletonBlock", () => {
  it("renders a pulsing placeholder with the card background and given size classes", () => {
    const { container } = render(<SkeletonBlock className="h-10 w-10" />);
    const block = container.firstChild as HTMLElement;

    expect(block).toHaveClass("animate-pulse", "bg-card", "h-10", "w-10");
  });
});
