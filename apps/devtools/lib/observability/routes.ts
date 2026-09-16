import type { MinuteTraffic, RouteSort, RouteTraffic } from "../api/observability";

/** `GET /v1/projects/{id}`; the catch-all `/` and the empty route (answered before routing) get names. */
export function routeLabel(r: Pick<RouteTraffic, "method" | "route">): string {
  if (r.route === "") return `${r.method} (before routing)`;
  if (r.route === "_overflow") return `${r.method} (beyond the series limit)`;
  return `${r.method} ${r.route}`;
}

export const routeKey = (r: Pick<RouteTraffic, "method" | "route">) => `${r.method} ${r.route}`;

/** The value a sort compares by, matching the server's `sort` parameter. */
export function routeSortValue(r: RouteTraffic, sort: RouteSort): number {
  switch (sort) {
    case "requests":
      return r.requests;
    case "errors":
      return r.server_errors;
    case "error_rate":
      return r.error_rate;
    case "p95":
      return r.latency_ms.p95;
    case "p99":
      return r.latency_ms.p99;
  }
}

/** Routes sorted the way the server would, largest first, ties by requests then name so the order is stable. */
export function sortRoutes(routes: RouteTraffic[], sort: RouteSort): RouteTraffic[] {
  return [...routes].sort((a, b) => routeSortValue(b, sort) - routeSortValue(a, sort) || b.requests - a.requests || routeKey(a).localeCompare(routeKey(b)));
}

/**
 * The slowest routes at p95, at most `n`. Routes with fewer than `minRequests`
 * are left out: one slow request shouldn't top the list.
 */
export function slowestRoutes(routes: RouteTraffic[], n = 5, minRequests = 1): RouteTraffic[] {
  return sortRoutes(
    routes.filter((r) => r.requests >= minRequests && r.latency_ms.p95 > 0),
    "p95",
  ).slice(0, n);
}

/**
 * The routes failing most, at most `n`: by error rate, then by the number of
 * server errors; routes without a server error don't appear.
 */
export function mostFailingRoutes(routes: RouteTraffic[], n = 5): RouteTraffic[] {
  return [...routes]
    .filter((r) => r.server_errors > 0)
    .sort((a, b) => b.error_rate - a.error_rate || b.server_errors - a.server_errors || routeKey(a).localeCompare(routeKey(b)))
    .slice(0, n);
}

/** One point per minute of the window, oldest first: the minutes without requests are zero. */
export type MinutePoint = { minute: string; requests: number; server_errors: number; p95_ms: number };

/**
 * Fills the window's minutes: the overview returns only minutes with
 * requests, and a sparkline needs the gaps. `from` is inclusive, `to`
 * exclusive; both are whole minutes. Capped at 24 h (1,440 points).
 */
export function fillMinutes(minutes: MinuteTraffic[] | null | undefined, from: string, to: string): MinutePoint[] {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return (minutes ?? []).map((m) => ({ ...m }));
  const byMinute = new Map<number, MinuteTraffic>();
  for (const m of minutes ?? []) {
    const t = Date.parse(m.minute);
    if (Number.isFinite(t)) byMinute.set(t - (t % 60_000), m);
  }
  const n = Math.min(1440, Math.round((end - start) / 60_000));
  const out: MinutePoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = start + i * 60_000;
    const m = byMinute.get(t);
    out.push({ minute: new Date(t).toISOString(), requests: m?.requests ?? 0, server_errors: m?.server_errors ?? 0, p95_ms: m?.p95_ms ?? 0 });
  }
  return out;
}

/** The label of a range as the segmented control shows it. */
export const rangeLabel: Record<string, string> = { "15m": "15 min", "1h": "1 h", "6h": "6 h", "24h": "24 h" };
