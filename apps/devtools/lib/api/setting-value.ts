/**
 * Typed input for runtime settings: what the edit form shows for a value of
 * each kind, and how the text typed back becomes the JSON `PUT /ops/settings`
 * expects. Validation here is a courtesy; the app's answer is the truth.
 */
import type { SettingConstraints, SettingKind } from "./types";

export type ParsedValue = { ok: true; value: unknown } | { ok: false; error: string };

/** How the form shows a value: the text in an input, or `true`/`false` for a switch. */
export function formatSettingValue(kind: SettingKind | string, value: unknown): string {
  if (value === null || value === undefined) return "";
  switch (kind) {
    case "string_list":
      return Array.isArray(value) ? value.map(String).join("\n") : String(value);
    case "bool":
      return value ? "true" : "false";
    case "int":
    case "float":
      return typeof value === "number" ? String(value) : String(value);
    default:
      return typeof value === "string" ? value : JSON.stringify(value);
  }
}

/** Go's duration syntax: a sequence of decimal numbers with units, such as 1h30m or 500ms; "0" alone is allowed. */
const goDuration = /^-?(\d+(\.\d+)?(ns|us|µs|μs|ms|s|m|h))+$|^0$/;

const unitMs: Record<string, number> = { ns: 1e-6, us: 1e-3, "µs": 1e-3, "μs": 1e-3, ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

/** Milliseconds in a Go duration string; NaN when it doesn't parse. */
export function durationMs(text: string): number {
  const s = text.trim();
  if (s === "0") return 0;
  if (!goDuration.test(s)) return NaN;
  let total = 0;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|μs|ms|s|m|h)/g)) total += Number(m[1]) * unitMs[m[2]];
  return s.startsWith("-") ? -total : total;
}

/** A short form of a Go duration for tables: 336h0m0s → 14d, 15m0s → 15m, 1h30m0s → 1h 30m. */
export function shortDuration(text: string): string {
  const ms = durationMs(text);
  if (Number.isNaN(ms)) return text;
  if (ms === 0) return "0";
  const parts: string[] = [];
  let rest = Math.abs(ms);
  const units: [string, number][] = [
    ["d", 86_400_000],
    ["h", 3_600_000],
    ["m", 60_000],
    ["s", 1000],
    ["ms", 1],
  ];
  for (const [u, n] of units) {
    if (rest >= n) {
      const q = Math.floor(rest / n);
      parts.push(`${q}${u}`);
      rest -= q * n;
    }
    if (parts.length === 2) break;
  }
  if (parts.length === 0) parts.push(`${ms}ms`);
  return (ms < 0 ? "-" : "") + parts.join(" ");
}

/** Turns the form's text into the JSON value of the kind, checking what the constraints say. */
export function parseSettingValue(kind: SettingKind | string, text: string, constraints: SettingConstraints = {}): ParsedValue {
  switch (kind) {
    case "bool":
      if (text === "true") return { ok: true, value: true };
      if (text === "false") return { ok: true, value: false };
      return { ok: false, error: "true or false" };
    case "int": {
      const t = text.trim();
      if (!/^-?\d+$/.test(t)) return { ok: false, error: "a whole number" };
      const n = Number(t);
      if (!Number.isSafeInteger(n)) return { ok: false, error: "too large" };
      return bounded(n, constraints);
    }
    case "float": {
      const t = text.trim();
      if (t === "" || Number.isNaN(Number(t))) return { ok: false, error: "a number" };
      return bounded(Number(t), constraints);
    }
    case "duration": {
      const t = text.trim();
      const ms = durationMs(t);
      if (Number.isNaN(ms)) return { ok: false, error: "a duration such as 30s, 15m, 1h30m or 24h" };
      if (typeof constraints.min === "string" && ms < durationMs(constraints.min)) return { ok: false, error: `at least ${shortDuration(constraints.min)}` };
      if (typeof constraints.max === "string" && ms > durationMs(constraints.max)) return { ok: false, error: `at most ${shortDuration(constraints.max)}` };
      return { ok: true, value: t };
    }
    case "enum": {
      const t = text.trim();
      if (Array.isArray(constraints.one_of) && !constraints.one_of.includes(t)) return { ok: false, error: `one of ${constraints.one_of.join(", ")}` };
      return { ok: true, value: t };
    }
    case "string_list": {
      const items = text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s !== "");
      if (typeof constraints.max_items === "number" && items.length > constraints.max_items) return { ok: false, error: `at most ${constraints.max_items} items` };
      return { ok: true, value: items };
    }
    default: {
      if (typeof constraints.max_len === "number" && text.length > constraints.max_len) return { ok: false, error: `at most ${constraints.max_len} characters` };
      if (constraints.format === "email" && text !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { ok: false, error: "an email address" };
      return { ok: true, value: text };
    }
  }
}

function bounded(n: number, c: SettingConstraints): ParsedValue {
  if (typeof c.min === "number" && n < c.min) return { ok: false, error: `at least ${c.min}` };
  if (typeof c.max === "number" && n > c.max) return { ok: false, error: `at most ${c.max}` };
  return { ok: true, value: n };
}

/** One line under the input: the kind and what the constraints allow. */
export function describeConstraints(kind: SettingKind | string, c: SettingConstraints = {}): string {
  const parts: string[] = [kind];
  if (kind === "duration") {
    if (typeof c.min === "string" && typeof c.max === "string") parts.push(`${shortDuration(c.min)} – ${shortDuration(c.max)}`);
    else if (typeof c.min === "string") parts.push(`≥ ${shortDuration(c.min)}`);
    else if (typeof c.max === "string") parts.push(`≤ ${shortDuration(c.max)}`);
  } else if (typeof c.min === "number" || typeof c.max === "number") {
    parts.push(`${c.min ?? "…"} – ${c.max ?? "…"}`);
  }
  if (Array.isArray(c.one_of)) parts.push(c.one_of.join(" | "));
  if (typeof c.max_len === "number") parts.push(`≤ ${c.max_len} chars`);
  if (typeof c.max_items === "number") parts.push(`≤ ${c.max_items} items`);
  if (c.format === "email") parts.push("email");
  return parts.join(" · ");
}

/** Values as tables show them: short durations, quoted-free strings, lists joined. */
export function displaySettingValue(kind: SettingKind | string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (kind === "duration" && typeof value === "string") return shortDuration(value);
  if (Array.isArray(value)) return value.length === 0 ? "" : value.map(String).join(", ");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
