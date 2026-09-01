import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CriadorAvatarSkeleton } from "@/components/skeletons/criador-avatar-skeleton";

describe("CriadorAvatarSkeleton", () => {
  it("renders the step indicator and the form field placeholders", () => {
    render(<CriadorAvatarSkeleton />);
    const root = screen.getByTestId("criador-avatar-skeleton");
    expect(root.querySelectorAll(".animate-pulse")).toHaveLength(7);
  });
});
