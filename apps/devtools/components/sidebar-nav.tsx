"use client";

import { Boxes, Database, Gauge, Mail, Route, ShieldCheck, SlidersHorizontal, Zap } from "lucide-react";
import { Nav } from "@gorbital/dash/components/nav";

export function SidebarNav() {
  return (
    <Nav
      sections={[
        {
          title: "Inspect",
          items: [
            { label: "Routes", href: "/", icon: Route, badge: 31 },
            { label: "Modules", href: "/modules", icon: Boxes },
            { label: "Bootstrap", href: "/bootstrap", icon: Gauge, badge: "412 ms" },
            { label: "Audit", href: "/audit", icon: ShieldCheck, badge: 2, tone: "hot" },
          ],
        },
        {
          title: "Bench",
          items: [
            { label: "Jobs", href: "/jobs", icon: Zap },
            { label: "Mail", href: "/mail", icon: Mail, badge: 4 },
            { label: "Settings", href: "/settings", icon: SlidersHorizontal },
            { label: "Database", href: "/database", icon: Database },
          ],
        },
      ]}
    />
  );
}
