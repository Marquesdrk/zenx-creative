import { describe, expect, it, vi } from "vitest";
import BibliotecaPage from "./page";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));

describe("BibliotecaPage", () => {
  it("redirects legacy links to the video downloader", () => {
    BibliotecaPage();
    expect(redirect).toHaveBeenCalledWith("/baixar-videos");
  });
});
