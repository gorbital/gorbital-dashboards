"use client";

import { Boxes, Database, LayoutDashboard, ListOrdered, Mail, Route, ScrollText, ShieldCheck, SlidersHorizontal, Zap } from "lucide-react";
import { Nav } from "@gorbital/dash/components/nav";
import { useCapabilities, useDevMail, useDevMigrations, useDevRoutes } from "@/lib/api/queries";

/** The nav; badges carry live counts where one request buys them: routes, captured mail, pending migrations. */
export function SidebarNav() {
  const { running, console, database } = useCapabilities();
  const routes = useDevRoutes(console);
  const migrations = useDevMigrations(console && database);
  const mail = useDevMail(console);
  const pending = migrations.data?.pending ?? 0;
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
            { label: "Routes", href: "/routes", icon: Route, badge: routes.data?.routes.length },
            { label: "Requests", href: "/requests", icon: ListOrdered },
            { label: "Logs", href: "/logs", icon: ScrollText },
            { label: "Modules", href: "/modules", icon: Boxes },
            { label: "Audit", href: "/audit", icon: ShieldCheck },
          ],
        },
        {
          title: "Bench",
          items: [
            { label: "Jobs", href: "/jobs", icon: Zap },
            { label: "Mail", href: "/mail", icon: Mail, badge: mail.data ? mail.data.total : undefined },
            { label: "Settings", href: "/settings", icon: SlidersHorizontal },
            { label: "Database", href: "/database", icon: Database, badge: pending > 0 ? `${pending} pending` : undefined, tone: pending > 0 ? "hot" : undefined },
          ],
        },
      ]}
    />
  );
}
