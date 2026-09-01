import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PerformancePage from "./page";

describe("PerformancePage", () => {
  it("renders the module title, subtitle, action button, and its skeleton", () => {
    render(<PerformancePage />);
    expect(screen.getByRole("heading", { name: "Performance dos perfis" })).toBeInTheDocument();
    expect(
      screen.getByText("Acompanhe o desempenho dos seus perfis e conteúdos.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar relatório" })).toBeInTheDocument();
    expect(screen.getByTestId("performance-skeleton")).toBeInTheDocument();
  });
});
