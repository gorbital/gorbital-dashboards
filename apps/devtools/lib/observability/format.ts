/**
 * Formatting for the Observability screen: ratios as percentages, bytes,
 * milliseconds and rates, the way the tiles and tables show them.
 */

/** A ratio from 0 to 1 as a percentage: `0.9992` → `99.9%`; `0.99999` → `>99.9%`, so it never reads as 100% unless it is. */
export function percent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "—";
  const p = ratio * 100;
  if (p > 0 && p < 100 && Number(p.toFixed(digits)) >= 100) return `>${(100 - 1 / 10 ** digits).toFixed(digits)}%`;
  if (p > 0 && Number(p.toFixed(digits)) === 0) return `<${(1 / 10 ** digits).toFixed(digits)}%`;
  return `${p.toFixed(digits)}%`;
}

/** A percentage the sampler already computed (0 to 100): `68.309` → `68%`, `0.22` → `0.2%`. */
export function percentOf100(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

/** Bytes in the unit that keeps the number short: `10409663` → `9.9 MB`; negative or unknown → `—`. */
export function bytes(b: number | undefined | null): string {
  if (b === undefined || b === null || !Number.isFinite(b) || b < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(v) : v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Milliseconds as the tables show them: `0.4` → `0.40 ms`, `18.4` → `18 ms`, `1420` → `1.42 s`, `95000` → `1 min 35 s`. */
export function millis(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  if (m < 60) return s ? `${m} min ${s} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

/** The lock table's `waiting_for_ms`, a decimal string, as milliseconds. */
export function millisFromString(s: string | undefined): string {
  const n = Number(s);
  return Number.isFinite(n) && s !== "" && s !== undefined ? millis(n) : "—";
}

/** Requests a minute as a rate: under 1/min shows per hour, over 120/min shows per second. */
export function rate(perMinute: number): string {
  if (!Number.isFinite(perMinute)) return "—";
  if (perMinute === 0) return "0/min";
  if (perMinute < 1) return `${(perMinute * 60).toFixed(1)}/h`;
  if (perMinute >= 120) return `${(perMinute / 60).toFixed(1)}/s`;
  return `${perMinute < 10 ? perMinute.toFixed(1) : Math.round(perMinute)}/min`;
}

/** A count with thousands separators; `-1` (PostgreSQL's "never analyzed") shows as `—`. */
export function count(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n) || n < 0) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

/** Seconds as `3d 4h`, `2h 5m`, `12m`, `40s`. */
export function seconds(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** A query's text on one line, whitespace collapsed, cut at `max` characters with an ellipsis. */
export function oneLine(sql: string, max = 120): string {
  const flat = sql.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
