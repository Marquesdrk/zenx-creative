import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarDays } from "lucide-react";
import { SidebarNavItem } from "@/components/shell/sidebar-nav-item";

describe("SidebarNavItem", () => {
  it("renders a link with the item's label and href, marked active via data-active", () => {
    render(
      <SidebarNavItem
        item={{ label: "Calendário", href: "/calendario", icon: CalendarDays }}
        isActive
      />
    );
    const link = screen.getByRole("link", { name: "Calendário" });

    expect(link).toHaveAttribute("href", "/calendario");
    expect(link).toHaveAttribute("data-active", "true");
  });

  it("marks the item inactive when isActive is false", () => {
    render(
      <SidebarNavItem
        item={{ label: "Calendário", href: "/calendario", icon: CalendarDays }}
        isActive={false}
      />
    );

    expect(screen.getByRole("link", { name: "Calendário" })).toHaveAttribute(
      "data-active",
      "false"
    );
  });
});
