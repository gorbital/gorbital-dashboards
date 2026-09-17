/**
 * The Routes page as pure logic: the dev console's list (`/_dev/routes`)
 * joined with what orb reads from the app's source (`/_portal/api/routes`)
 * by method and path, the page's filters, and how a guard reads as a chip.
 */

import type { RouteInfo } from "@/lib/api/routes";
import type { DevRoute } from "@/lib/api/types";

/** A dev console route with what the source says about it; `info` is missing when orb didn't list it (or hasn't answered). */
export type JoinedRoute = DevRoute & {
  info?: RouteInfo;
  /** The dev console lists it; false for a route only the source knows. */
  inConsole: boolean;
};

export const routeKey = (r: { method: string; path: string }) => `${r.method.toUpperCase()} ${r.path}`;

/** The console's routes in its order, each with its RouteInfo, then the routes only the source knows, in its order. */
export function joinRoutes(console: DevRoute[], infos: RouteInfo[] | undefined): JoinedRoute[] {
  const byKey = new Map<string, RouteInfo>();
  for (const i of infos ?? []) byKey.set(routeKey(i), i);
  const seen = new Set<string>();
  const out: JoinedRoute[] = [];
  for (const r of console) {
    const k = routeKey(r);
    seen.add(k);
    out.push({ ...r, info: byKey.get(k), inConsole: true });
  }
  for (const i of infos ?? []) {
    const k = routeKey(i);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      method: i.method.toUpperCase(),
      path: i.path,
      operation_id: i.operation_id || undefined,
      summary: i.summary || undefined,
      tags: i.tags,
      secured: !i.public,
      source: "openapi",
      info: i,
      inConsole: false,
    });
  }
  return out;
}

export const isPublic = (r: JoinedRoute) => r.info?.public === true;

export type RouteSourceFilter = "all" | "openapi" | "handler";

export type RouteFilter = {
  /** A tag, `(untagged)`, or `all`. */
  tag: string;
  source: RouteSourceFilter;
  search: string;
  /** Only routes that need no sign-in. */
  publicOnly: boolean;
};

export const routeTags = (r: DevRoute) => (r.tags.length ? r.tags : ["(untagged)"]);

/** The page's filters; the search reads the method, path, operation, summary, tags, module, handler, guards and middleware. */
export function filterRoutes(routes: JoinedRoute[], f: RouteFilter): JoinedRoute[] {
  const q = f.search.trim().toLowerCase();
  return routes.filter((r) => {
    if (f.tag !== "all" && !routeTags(r).includes(f.tag)) return false;
    if (f.source !== "all" && r.source !== f.source) return false;
    if (f.publicOnly && !isPublic(r)) return false;
    if (q) {
      const i = r.info;
      const text = `${r.method} ${r.path} ${r.operation_id ?? ""} ${r.summary ?? ""} ${r.tags.join(" ")} ${i ? `${i.module} ${i.handler} ${i.guards.join(" ")} ${i.middleware.join(" ")}` : ""}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
}

export type GuardKind = "public" | "authenticated" | "permission" | "role" | "rate_limit" | "webhook" | "other";

export type GuardChip = {
  kind: GuardKind;
  /** What the chip shows: the argument without the guard's name where the icon says it. */
  label: string;
  /** The guard as the OpenAPI names it, for the tooltip. */
  title: string;
};

/** Go's `1m0s`, `1h0m0s`, `30s` → `1m`, `1h`, `30s`. */
export function shortDuration(d: string): string {
  const out = d.replace(/(\d+[hm])0s$/, "$1").replace(/(\d+h)0m$/, "$1");
  return out || d;
}

/** How one `x-gorbital-guards` entry reads as a chip. */
export function guardChip(guard: string): GuardChip {
  const i = guard.indexOf(":");
  const name = i < 0 ? guard : guard.slice(0, i);
  const arg = i < 0 ? "" : guard.slice(i + 1);
  switch (name) {
    case "public":
      return { kind: "public", label: "public", title: "no sign-in required" };
    case "authenticated":
      return { kind: "authenticated", label: "signed in", title: "authenticated: needs a signed-in actor" };
    case "permission":
      return { kind: "permission", label: arg || "permission", title: `permission ${arg}` };
    case "role":
      return { kind: "role", label: arg ? `role ${arg}` : "role", title: `role ${arg}` };
    case "rate_limit": {
      const [n, window] = arg.split("/");
      return { kind: "rate_limit", label: window ? `${n}/${shortDuration(window)}` : arg || "rate limit", title: `rate limit ${arg}` };
    }
    default:
      if (name.startsWith("webhook")) return { kind: "webhook", label: guard, title: guard };
      return { kind: "other", label: guard, title: guard };
  }
}

/** The guards worth a chip in the list: `public` and `authenticated` are said by the badge already. */
export function listGuards(guards: string[]): string[] {
  return guards.filter((g) => g !== "public" && g !== "authenticated");
}

/** `file:line`, or just the file when the line is unknown. */
export function sourceLabel(pos: { file: string; line: number } | null | undefined): string {
  if (!pos) return "";
  return pos.line > 0 ? `${pos.file}:${pos.line}` : pos.file;
}
