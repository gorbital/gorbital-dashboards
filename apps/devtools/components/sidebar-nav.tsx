"use client";

import { Activity, Boxes, Database, FileKey2, FolderOpen, GitBranch, GitCommitHorizontal, Globe, KeyRound, LayoutDashboard, ListOrdered, Mail, Route, ScrollText, Settings, ShieldCheck, SlidersHorizontal, Table2, TerminalSquare, Wand2, Waypoints, Zap } from "lucide-react";
import { Nav, type NavSection } from "@gorbital/dash/components/nav";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { isNoMailCatcher, useInbox } from "@/lib/api/mail";
import { useTunnel } from "@/lib/api/tunnel";
import { useCapabilities, useDevMail, useDevMigrations, useDevRoutes } from "@/lib/api/queries";

/** The nav; badges carry live counts where one request buys them: routes, caught mail (orb dev's inbox, or Mailpit's without a catcher), pending migrations. */
export function SidebarNav() {
  const { status, running, console, database } = useCapabilities();
  const routes = useDevRoutes(console);
  const migrations = useDevMigrations(console && database);
  const inbox = useInbox("", Boolean(status.data));
  const mail = useDevMail(console && isNoMailCatcher(inbox.error));
  const caught = inbox.data ? inbox.data.count : mail.data ? mail.data.total : undefined;
  const pending = migrations.data?.pending ?? 0;
  const noDatabase = status.data?.portal.database === false;
  const tunnel = useTunnel();
  const tunnelLive = tunnel.data?.status.state === "connected";
  const sections: NavSection[] = [
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
        { label: "Observability", href: "/observability", icon: Activity },
      ],
    },
    {
      title: "Bench",
      items: [
        { label: "Jobs", href: "/jobs", icon: Zap },
        { label: "Mail", href: "/mail", icon: Mail, badge: caught },
        { label: "Settings", href: "/settings", icon: SlidersHorizontal },
        { label: "Environment", href: "/environment", icon: FileKey2 },
        { label: "Authentication", href: "/auth", icon: KeyRound },
        { label: "Tunnel", href: "/tunnel", icon: Globe, tone: tunnelLive ? "live" : undefined },
        { label: "Database", href: "/database", icon: Database, badge: pending > 0 ? `${pending} pending` : undefined, tone: pending > 0 ? "hot" : undefined },
        { label: "Storage", href: "/storage", icon: FolderOpen },
        { label: "Git", href: "/git", icon: GitBranch },
        { label: "Generators", href: "/generators", icon: Wand2, badge: status.data?.generators.length },
        { label: "Project", href: "/project", icon: Settings },
      ],
    },
  ];
  if (!noDatabase) {
    sections.push({
      title: "Database",
      items: [
        { label: "Table Editor", href: "/database/tables", icon: Table2 },
        { label: "SQL Editor", href: "/database/sql", icon: TerminalSquare },
        { label: "Schema", href: "/database/schema", icon: Waypoints },
        { label: "Objects", href: "/database/objects", icon: Boxes },
        { label: "Migrations", href: "/database/migrations", icon: GitCommitHorizontal },
      ],
    });
  }
  return (
    <>
      <Nav sections={sections} />
      {noDatabase && <NoDatabaseSection />}
    </>
  );
}

/** The Database section when the app has no database: the same look, greyed, with the reason on hover. */
function NoDatabaseSection() {
  const items = [
    { label: "Table Editor", icon: Table2 },
    { label: "SQL Editor", icon: TerminalSquare },
    { label: "Schema", icon: Waypoints },
    { label: "Objects", icon: Boxes },
    { label: "Migrations", icon: GitCommitHorizontal },
  ];
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-3 pt-4 pb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Database</div>
      {items.map(({ label, icon: Icon }) => (
        <Tooltip key={label} content="This app has no database" side="right">
          <span className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-[7px] font-medium text-faint" aria-disabled="true">
            <Icon size={15} strokeWidth={1.75} />
            <span>{label}</span>
          </span>
        </Tooltip>
      ))}
    </div>
  );
}
