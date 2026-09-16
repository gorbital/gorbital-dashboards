/**
 * The Logs screen's filters and their URL form. A view is its query
 * string: `/logs?range=1h&source=http,auth&status_class=5xx&q=timeout`
 * reproduces the same list for whoever opens it, and the same names go to
 * `/_portal/api/logs` (ADR-0072), so the codec is one table.
 */

export type RangePreset = "15m" | "1h" | "6h" | "24h" | "7d";

export const rangePresets: { value: RangePreset; label: string; ms: number }[] = [
  { value: "15m", label: "15m", ms: 15 * 60_000 },
  { value: "1h", label: "1h", ms: 3_600_000 },
  { value: "6h", label: "6h", ms: 6 * 3_600_000 },
  { value: "24h", label: "24h", ms: 24 * 3_600_000 },
  { value: "7d", label: "7d", ms: 7 * 86_400_000 },
];

export const defaultRange: RangePreset = "1h";

export const levels = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
export type Level = (typeof levels)[number];

/** The sources the store knows, in the order the chips show them. */
export const sources = ["http", "auth", "jobs", "mail", "storage", "postgres", "app", "orb"] as const;
export type Source = (typeof sources)[number];

export const sourceLabels: Record<Source, string> = { http: "HTTP", auth: "Auth", jobs: "Jobs", mail: "Mail", storage: "Storage", postgres: "Postgres", app: "App", orb: "Orb" };

export const statusClasses = ["2xx", "3xx", "4xx", "5xx"] as const;

export type LogFilters = {
  /** A window ending now. Ignored when `from` or `to` is set (a zoom or a custom range). */
  range?: RangePreset;
  /** RFC 3339. */
  from?: string;
  to?: string;
  /** Keep records at these levels. */
  level?: string[];
  /** Keep records at or above this level. */
  min_level?: string;
  source?: string[];
  /** A user_id, email or actor_id attribute, exactly. */
  user?: string;
  method?: string;
  /** A prefix of the path or route attribute. */
  path?: string;
  status_class?: string;
  status?: number;
  min_duration_ms?: number;
  request_id?: string;
  trace_id?: string;
  /** A case-insensitive substring of the message, an attribute or the raw line. */
  q?: string;
};

const textKeys = ["min_level", "user", "method", "path", "status_class", "request_id", "trace_id", "q"] as const;
const listKeys = ["level", "source"] as const;
const numberKeys = ["status", "min_duration_ms"] as const;

const isPreset = (v: string | null): v is RangePreset => rangePresets.some((p) => p.value === v);

/** Reads the filters from a query string; unknown parameters (`view`, `id`) are ignored, malformed values dropped. */
export function parseFilters(params: URLSearchParams): LogFilters {
  const f: LogFilters = {};
  const range = params.get("range");
  if (isPreset(range)) f.range = range;
  for (const k of ["from", "to"] as const) {
    const v = params.get(k);
    if (v && !Number.isNaN(Date.parse(v))) f[k] = v;
  }
  for (const k of textKeys) {
    const v = params.get(k)?.trim();
    if (v) f[k] = k === "method" || k === "min_level" ? v.toUpperCase() : v;
  }
  for (const k of listKeys) {
    const v = (params.get(k) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (v.length > 0) f[k] = k === "level" ? v.map((s) => s.toUpperCase()) : v.map((s) => s.toLowerCase());
  }
  for (const k of numberKeys) {
    const v = params.get(k);
    if (v !== null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) f[k] = Number(v);
  }
  return normalizeFilters(f);
}

/** Drops empty values, so two filter objects that mean the same compare equal. */
export function normalizeFilters(f: LogFilters): LogFilters {
  const out: LogFilters = {};
  if (f.from || f.to) {
    if (f.from) out.from = f.from;
    if (f.to) out.to = f.to;
  } else if (f.range && f.range !== defaultRange) out.range = f.range;
  for (const k of textKeys) if (f[k]?.trim()) out[k] = f[k]!.trim();
  for (const k of listKeys) {
    const v = [...new Set((f[k] ?? []).map((s) => s.trim()).filter(Boolean))];
    if (v.length > 0) out[k] = v;
  }
  for (const k of numberKeys) if (typeof f[k] === "number" && Number.isFinite(f[k]) && f[k]! >= 0 && !(k === "status" && f[k] === 0)) out[k] = f[k];
  return out;
}

/** The filters as a query string, in a stable order; empty when nothing is set. */
export function filtersToParams(f: LogFilters): URLSearchParams {
  const n = normalizeFilters(f);
  const p = new URLSearchParams();
  if (n.range) p.set("range", n.range);
  if (n.from) p.set("from", n.from);
  if (n.to) p.set("to", n.to);
  for (const k of listKeys) if (n[k]) p.set(k, n[k]!.join(","));
  for (const k of textKeys) if (n[k]) p.set(k, n[k]!);
  for (const k of numberKeys) if (n[k] !== undefined) p.set(k, String(n[k]));
  return p;
}

export function filtersEqual(a: LogFilters, b: LogFilters): boolean {
  return filtersToParams(a).toString() === filtersToParams(b).toString();
}

/** The filters other than the time window: what the "Clear filters" button removes. */
export function countActiveFilters(f: LogFilters): number {
  const n = normalizeFilters(f);
  return [...textKeys, ...listKeys, ...numberKeys].filter((k) => n[k] !== undefined).length;
}

export type ResolvedRange = { from: number; to: number; ms: number; absolute: boolean };

/** The window in milliseconds since the epoch, with a preset resolved against `now`. */
export function resolveRange(f: LogFilters, now: number): ResolvedRange {
  if (f.from || f.to) {
    const to = f.to ? Date.parse(f.to) : now;
    const from = f.from ? Date.parse(f.from) : to - 3_600_000;
    return { from, to, ms: Math.max(0, to - from), absolute: true };
  }
  const preset = rangePresets.find((p) => p.value === (f.range ?? defaultRange)) ?? rangePresets[1];
  return { from: now - preset.ms, to: now, ms: preset.ms, absolute: false };
}

/** The histogram's bucket for a window: per minute up to 2 h, then 5 m to 12 h, 15 m to 24 h, an hour beyond. */
export function bucketFor(rangeMs: number): { bucket: string; ms: number } {
  if (rangeMs <= 2 * 3_600_000) return { bucket: "1m", ms: 60_000 };
  if (rangeMs <= 12 * 3_600_000) return { bucket: "5m", ms: 5 * 60_000 };
  if (rangeMs <= 24 * 3_600_000) return { bucket: "15m", ms: 15 * 60_000 };
  return { bucket: "1h", ms: 3_600_000 };
}

/**
 * The query-string values for `/_portal/api/logs*`: the window as `from`
 * (and `to` when it isn't now), lists joined with commas. `at` is the time
 * a preset resolves against, so the query key can stay the filters alone.
 */
export function filtersToApi(f: LogFilters, at: number): Record<string, string | number | undefined> {
  const n = normalizeFilters(f);
  const r = resolveRange(n, at);
  return {
    from: new Date(r.from).toISOString(),
    to: r.absolute && n.to ? new Date(r.to).toISOString() : undefined,
    level: n.level?.join(","),
    min_level: n.min_level,
    source: n.source?.join(","),
    user: n.user,
    method: n.method,
    path: n.path,
    status_class: n.status_class,
    status: n.status,
    min_duration_ms: n.min_duration_ms,
    request_id: n.request_id,
    trace_id: n.trace_id,
    q: n.q,
  };
}

/** Short chips for the active filters, for the header and the saved-filter list. */
export function describeFilters(f: LogFilters): string[] {
  const n = normalizeFilters(f);
  const out: string[] = [];
  if (n.from || n.to) out.push(`${n.from ? shortTime(n.from) : "…"} → ${n.to ? shortTime(n.to) : "now"}`);
  else out.push(`last ${n.range ?? defaultRange}`);
  if (n.source) out.push(n.source.join(", "));
  if (n.level) out.push(n.level.join(", "));
  if (n.min_level) out.push(`≥ ${n.min_level}`);
  if (n.user) out.push(`user ${n.user}`);
  if (n.method) out.push(n.method);
  if (n.path) out.push(`path ${n.path}`);
  if (n.status_class) out.push(n.status_class);
  if (n.status !== undefined) out.push(`status ${n.status}`);
  if (n.min_duration_ms !== undefined) out.push(`≥ ${n.min_duration_ms} ms`);
  if (n.request_id) out.push(`request ${n.request_id}`);
  if (n.trace_id) out.push(`trace ${n.trace_id.slice(0, 12)}…`);
  if (n.q) out.push(`"${n.q}"`);
  return out;
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Reads a saved filter's `query` (any JSON) back into filters, ignoring what isn't one. */
export function filtersFromJSON(query: unknown): LogFilters {
  if (!query || typeof query !== "object") return {};
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query as Record<string, unknown>)) {
    if (Array.isArray(v)) p.set(k, v.map(String).join(","));
    else if (typeof v === "string" || typeof v === "number") p.set(k, String(v));
  }
  return parseFilters(p);
}
