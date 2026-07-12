import { describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import RootPage from "./page";

describe("RootPage", () => {
  it("redirects to /editor", () => {
    RootPage();
    expect(redirectMock).toHaveBeenCalledWith("/editor");
  });
});
