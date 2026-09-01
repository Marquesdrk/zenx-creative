import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BibliotecaPage from "./page";

describe("BibliotecaPage", () => {
  it("renders the module title, subtitle, action button, and its skeleton", () => {
    render(<BibliotecaPage />);
    expect(screen.getByRole("heading", { name: "Biblioteca de vídeos" })).toBeInTheDocument();
    expect(
      screen.getByText("Gerencie, organize e utilize seus vídeos em todos os seus projetos.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Enviar vídeo" })).toBeInTheDocument();
    expect(screen.getByTestId("biblioteca-skeleton")).toBeInTheDocument();
  });
});
