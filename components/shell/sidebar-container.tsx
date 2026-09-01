"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { ProfileMenu } from "./profile-menu";

export function SidebarContainer() {
  const pathname = usePathname();
  return <Sidebar activeHref={pathname} profile={<ProfileMenu />} />;
}
