import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalendarioPage from "./page";

describe("CalendarioPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the scheduler shell and empty states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/batches") {
          return Response.json({ batches: [], items: [] });
        }
        if (url === "/api/publications") {
          return Response.json([]);
        }
        return Response.json({});
      })
    );

    render(<CalendarioPage />);
    expect(screen.getByRole("heading", { name: "Calendário" })).toBeInTheDocument();
    expect(
      screen.getByText("Visualize e gerencie todos os agendamentos de posts em um só lugar.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rodar pendentes/ })).toBeInTheDocument();
    expect(await screen.findByText("Nenhum post agendado para este período.")).toBeInTheDocument();
  });
});
