import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CriadorAvatarPage from "./page";

describe("CriadorAvatarPage", () => {
  it("renders the module title, subtitle, and the avatar creator form", () => {
    render(<CriadorAvatarPage />);
    expect(screen.getByRole("heading", { name: "Criador de Avatar" })).toBeInTheDocument();
    expect(
      screen.getByText("Construa influenciadores virtuais completos, do zero ao publicado.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar avatar com IA/ })).toBeInTheDocument();
  });
});
