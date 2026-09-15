"use client";

import { Bell, Cloud, Database, HeartPulse, History, Layers, LayoutGrid, Rocket, Server } from "lucide-react";
import { Nav } from "@gorbital/dash/components/nav";

export function SidebarNav() {
  return (
    <Nav
      style="rail"
      sections={[
        {
          items: [
            { label: "Overview", href: "/", icon: LayoutGrid },
            { label: "Releases", href: "/releases", icon: Rocket, badge: "rolling", tone: "accent" },
            { label: "Environments", href: "/environments", icon: Layers, badge: 3 },
            { label: "Instances", href: "/instances", icon: Server, badge: 4 },
            { label: "Migrations", href: "/migrations", icon: Database, badge: 1, tone: "hot" },
            { label: "Health", href: "/health", icon: HeartPulse },
            { label: "History", href: "/history", icon: History },
          ],
        },
        {
          title: "Settings",
          items: [
            { label: "Providers", href: "/providers", icon: Cloud },
            { label: "Notifications", href: "/notifications", icon: Bell },
          ],
        },
      ]}
    />
  );
}
