import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EditorPage from "./page";

describe("EditorPage", () => {
  it("renders the module title, subtitle, and its skeleton", () => {
    render(<EditorPage />);
    expect(screen.getByRole("heading", { name: "Editor em massa" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Importe e edite vídeos em massa: marca d'água, legendas e templates automáticos."
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId("editor-skeleton")).toBeInTheDocument();
  });
});
