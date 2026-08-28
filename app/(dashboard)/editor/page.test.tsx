import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import EditorPage from "./page";

describe("EditorPage", () => {
  it("renders the module title, subtitle, and the empty state before any batch is created", () => {
    render(<EditorPage />);
    expect(screen.getByRole("heading", { name: "Editor em massa" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Edite, personalize e prepare vários vídeos em lote com templates, legendas e IA."
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Nenhum lote encontrado/)).toBeInTheDocument();
  });

  it("opens the batch modal when '+ Novo lote' is clicked", async () => {
    const user = userEvent.setup();
    render(<EditorPage />);

    await user.click(screen.getByRole("button", { name: "+ Novo lote" }));

    expect(screen.getByRole("heading", { name: "Novo lote" })).toBeInTheDocument();
  });
});
