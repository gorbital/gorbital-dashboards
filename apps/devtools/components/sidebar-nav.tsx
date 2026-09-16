"use client";

import { Boxes, Database, Gauge, LayoutDashboard, Mail, Route, ShieldCheck, SlidersHorizontal, Zap } from "lucide-react";
import { Nav } from "@gorbital/dash/components/nav";
import { useStatus } from "@/lib/api/queries";
import { bootstrapTotal, findings, outbox, routes } from "@/lib/mock";

export function SidebarNav() {
  const { data } = useStatus();
  const running = data?.app.state === "running";
  return (
    <Nav
      sections={[
        {
          title: "Overview",
          items: [{ label: "Overview", href: "/", icon: LayoutDashboard, tone: running ? "live" : undefined }],
        },
        {
          title: "Inspect",
          items: [
            { label: "Routes", href: "/routes", icon: Route, badge: routes.length },
            { label: "Modules", href: "/modules", icon: Boxes },
            { label: "Bootstrap", href: "/bootstrap", icon: Gauge, badge: `${Math.round(bootstrapTotal)} ms` },
            { label: "Audit", href: "/audit", icon: ShieldCheck, badge: findings.filter((f) => f.level === "error").length, tone: "hot" },
          ],
        },
        {
          title: "Bench",
          items: [
            { label: "Jobs", href: "/jobs", icon: Zap },
            { label: "Mail", href: "/mail", icon: Mail, badge: outbox.length },
            { label: "Settings", href: "/settings", icon: SlidersHorizontal },
            { label: "Database", href: "/database", icon: Database },
          ],
        },
      ]}
    />
  );
}
