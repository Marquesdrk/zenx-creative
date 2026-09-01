import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProfileMenu } from "@/components/shell/profile-menu";

describe("ProfileMenu", () => {
  it("shows the account name and plan, with the menu closed by default", () => {
    render(<ProfileMenu />);
    expect(screen.getByText("Zenx Creative")).toBeInTheDocument();
    expect(screen.getByText("Plano Pro")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the menu with Configurações and Sair when clicked", async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />);

    await user.click(screen.getByRole("button", { name: /zenx creative/i }));

    expect(screen.getByRole("menuitem", { name: /configurações/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sair/i })).toBeInTheDocument();
  });

  it("closes the menu when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />);

    await user.click(screen.getByRole("button", { name: /zenx creative/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
