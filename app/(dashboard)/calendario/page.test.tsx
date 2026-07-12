import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CalendarioPage from "./page";

describe("CalendarioPage", () => {
  it("renders the module title, subtitle, action button, and its skeleton", () => {
    render(<CalendarioPage />);
    expect(screen.getByRole("heading", { name: "Calendário de postagem" })).toBeInTheDocument();
    expect(
      screen.getByText("Visualize, edite e organize todas as suas publicações.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Agendar post" })).toBeInTheDocument();
    expect(screen.getByTestId("calendario-skeleton")).toBeInTheDocument();
  });
});
