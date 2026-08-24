import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalendarioPage from "./page";

describe("CalendarioPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the scheduler shell and empty states", () => {
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
    expect(screen.getByRole("heading", { name: "Calendário de postagem" })).toBeInTheDocument();
    expect(
      screen.getByText("Programe vídeos renderizados para Instagram Reels, Facebook e TikTok.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rodar pendentes/ })).toBeInTheDocument();
    expect(screen.getByText("Vídeos prontos para agendar")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma publicação agendada ainda.")).toBeInTheDocument();
  });
});
