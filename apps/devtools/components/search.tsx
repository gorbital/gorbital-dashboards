"use client";

import { Activity, Boxes, Database, KeyRound, LayoutDashboard, ListOrdered, Mail, Play, RotateCw, Route, ScrollText, ShieldCheck, SlidersHorizontal, Square, Zap } from "lucide-react";
import { CommandPalette, type CommandItem } from "@gorbital/dash/components/command";
import { useAppAction, useCapabilities, useDevRoutes } from "@/lib/api/queries";

const pages: CommandItem[] = [
  { id: "page:overview", label: "Overview", hint: "/", href: "/", icon: <LayoutDashboard size={13} />, group: "Pages" },
  { id: "page:routes", label: "Routes", hint: "/routes", href: "/routes", icon: <Route size={13} />, group: "Pages" },
  { id: "page:requests", label: "Requests", hint: "/requests", href: "/requests", icon: <ListOrdered size={13} />, group: "Pages" },
  { id: "page:logs", label: "Logs", hint: "/logs", href: "/logs", icon: <ScrollText size={13} />, group: "Pages" },
  { id: "page:modules", label: "Modules", hint: "/modules", href: "/modules", icon: <Boxes size={13} />, group: "Pages" },
  { id: "page:audit", label: "Audit", hint: "/audit", href: "/audit", icon: <ShieldCheck size={13} />, group: "Pages" },
  { id: "page:observability", label: "Observability", hint: "/observability", href: "/observability", icon: <Activity size={13} />, group: "Pages", keywords: ["health", "latency", "p95", "database", "statements", "pg_stat_statements", "advice", "system", "cpu", "memory", "goroutines"] },
  { id: "page:jobs", label: "Jobs", hint: "/jobs", href: "/jobs", icon: <Zap size={13} />, group: "Pages" },
  { id: "page:mail", label: "Mail", hint: "/mail", href: "/mail", icon: <Mail size={13} />, group: "Pages" },
  { id: "page:settings", label: "Settings", hint: "/settings", href: "/settings", icon: <SlidersHorizontal size={13} />, group: "Pages" },
  { id: "page:auth", label: "Authentication", hint: "/auth", href: "/auth", icon: <KeyRound size={13} />, group: "Pages", keywords: ["users", "accounts", "sessions", "providers", "rate limits"] },
  { id: "page:database", label: "Database", hint: "/database", href: "/database", icon: <Database size={13} />, group: "Pages" },
];

/** The ⌘K palette with the pages, the app's live routes, and the app actions the portal offers. */
export function Search({ hint }: { hint: string }) {
  const { status, console } = useCapabilities();
  const routes = useDevRoutes(console);
  const restart = useAppAction("restart");
  const stop = useAppAction("stop");
  const start = useAppAction("start");
  const state = status.data?.app.state;
  const actions: CommandItem[] = [];
  if (status.data && state !== "building" && state !== "preparing") actions.push({ id: "app:restart", label: "Restart the app", hint: "rebuild", icon: <RotateCw size={13} />, group: "App", onSelect: () => restart.mutate() });
  if (state === "running") actions.push({ id: "app:stop", label: "Stop the app", hint: "stays stopped", icon: <Square size={13} />, group: "App", onSelect: () => stop.mutate() });
  if (state === "stopped") actions.push({ id: "app:start", label: "Start the app", hint: "no rebuild", icon: <Play size={13} />, group: "App", onSelect: () => start.mutate() });
  if (status.data?.project.database) actions.push({ id: "jobs:new", label: "New job", hint: "form, CLI or code", icon: <Zap size={13} />, group: "App", href: "/jobs?new=1" });
  const routeItems: CommandItem[] = (routes.data?.routes ?? []).map((r) => ({
    id: `route:${r.method} ${r.path}`,
    label: `${r.method} ${r.path}`,
    hint: r.operation_id ?? r.source,
    href: `/routes?route=${encodeURIComponent(`${r.method} ${r.path}`)}`,
    keywords: [...r.tags, r.summary ?? ""],
    group: "Routes",
  }));
  return <CommandPalette hint={hint} items={[...pages, ...actions, ...routeItems]} />;
}
