"use client";

import { Activity, AlertCircle, FileText, KeyRound, LayoutGrid, List, Mail, Server, Timer, Zap } from "lucide-react";
import { Nav } from "@apistock/dash/components/nav";

export function SidebarNav() {
  return (
    <Nav
      sections={[
        {
          items: [
            { label: "Overview", href: "/", icon: LayoutGrid },
            { label: "Requests", href: "/requests", icon: List },
            { label: "Traces", href: "/traces", icon: Activity },
            { label: "Errors", href: "/errors", icon: AlertCircle, badge: 3, tone: "hot" },
            { label: "Jobs", href: "/jobs", icon: Zap },
            { label: "Mail", href: "/mail", icon: Mail },
            { label: "Logs", href: "/logs", icon: FileText },
          ],
        },
        {
          title: "Settings",
          items: [
            { label: "Instances", href: "/instances", icon: Server, badge: 3 },
            { label: "Retention", href: "/retention", icon: Timer },
            { label: "API keys", href: "/api-keys", icon: KeyRound },
          ],
        },
      ]}
    />
  );
}
