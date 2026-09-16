"use client";

import { Boxes, Database, Gauge, LayoutDashboard, Mail, Play, RotateCw, Route, ShieldCheck, SlidersHorizontal, Square, Zap } from "lucide-react";
import { CommandPalette, type CommandItem } from "@gorbital/dash/components/command";
import { useAppAction, useStatus } from "@/lib/api/queries";
import { routes } from "@/lib/mock";

const pages: CommandItem[] = [
  { id: "page:overview", label: "Overview", hint: "/", href: "/", icon: <LayoutDashboard size={13} />, group: "Pages" },
  { id: "page:routes", label: "Routes", hint: "/routes", href: "/routes", icon: <Route size={13} />, group: "Pages" },
  { id: "page:modules", label: "Modules", hint: "/modules", href: "/modules", icon: <Boxes size={13} />, group: "Pages" },
  { id: "page:bootstrap", label: "Bootstrap", hint: "/bootstrap", href: "/bootstrap", icon: <Gauge size={13} />, group: "Pages" },
  { id: "page:audit", label: "Audit", hint: "/audit", href: "/audit", icon: <ShieldCheck size={13} />, group: "Pages" },
  { id: "page:jobs", label: "Jobs", hint: "/jobs", href: "/jobs", icon: <Zap size={13} />, group: "Pages" },
  { id: "page:mail", label: "Mail", hint: "/mail", href: "/mail", icon: <Mail size={13} />, group: "Pages" },
  { id: "page:settings", label: "Settings", hint: "/settings", href: "/settings", icon: <SlidersHorizontal size={13} />, group: "Pages" },
  { id: "page:database", label: "Database", hint: "/database", href: "/database", icon: <Database size={13} />, group: "Pages" },
];

const routeItems: CommandItem[] = routes.map((r) => ({ id: `route:${r.id}`, label: `${r.method} ${r.path}`, hint: r.handler, href: "/routes", keywords: [r.module, r.op], group: "Routes" }));

/** The ⌘K palette with the pages, the routes, and the app actions the portal offers. */
export function Search({ hint }: { hint: string }) {
  const { data } = useStatus();
  const restart = useAppAction("restart");
  const stop = useAppAction("stop");
  const start = useAppAction("start");
  const state = data?.app.state;
  const actions: CommandItem[] = [];
  if (data && state !== "building" && state !== "preparing") actions.push({ id: "app:restart", label: "Restart the app", hint: "rebuild", icon: <RotateCw size={13} />, group: "App", onSelect: () => restart.mutate() });
  if (state === "running") actions.push({ id: "app:stop", label: "Stop the app", hint: "stays stopped", icon: <Square size={13} />, group: "App", onSelect: () => stop.mutate() });
  if (state === "stopped") actions.push({ id: "app:start", label: "Start the app", hint: "no rebuild", icon: <Play size={13} />, group: "App", onSelect: () => start.mutate() });
  return <CommandPalette hint={hint} items={[...pages, ...actions, ...routeItems]} />;
}
