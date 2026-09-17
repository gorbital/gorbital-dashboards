import type { EnvEntry } from "@/lib/api/env";
import type { DevEnvKey } from "@/lib/api/types";

/*
 * The Environment screen's pure logic: key names, masking, what the
 * running app read, grouping and filtering.
 */

/** orb dev's rule for a key (`envKeyPattern` in cli/internal/portal/env.go). */
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why a new key's name isn't accepted, or undefined when it is. */
export function keyNameError(name: string, existing: string[] = []): string | undefined {
  const k = name.trim();
  if (!k) return "A key is required.";
  if (!ENV_KEY_PATTERN.test(k)) return "A key is letters, digits and underscores, not starting with a digit.";
  if (existing.includes(k)) return `${k} is already in the file; edit it in the table.`;
  return undefined;
}

/** Why a value isn't accepted (orb dev refuses values that span lines). */
export function valueError(value: string): string | undefined {
  if (/[\r\n]/.test(value)) return "A value can't span lines.";
  return undefined;
}

/** Masks a value the way orb dev does: eight dots, with the first and last two characters when it is longer than eight. */
export function maskValue(v: string): string {
  if (v.length <= 8) return "••••••••";
  return `${v.slice(0, 2)}••••••••${v.slice(-2)}`;
}

/** True when a value is the server's mask rather than the real thing. */
export function isMasked(v: string): boolean {
  return /^(.{2})?••••••••(.{2})?$/.test(v);
}

/** The value a cell shows: the revealed one when known, the masked or plain one otherwise. */
export function shownValue(entry: EnvEntry, revealed: Record<string, string>): { value: string; masked: boolean } {
  if (!entry.set) return { value: "", masked: false };
  if (entry.secret && entry.value !== "") {
    const r = revealed[entry.key];
    return r === undefined ? { value: entry.value, masked: true } : { value: r, masked: false };
  }
  return { value: entry.value, masked: false };
}

/** Whether the running app read the key: true, false, or undefined when the console hasn't answered. */
export function readByApp(key: string, config: DevEnvKey[] | undefined): boolean | undefined {
  if (!config) return undefined;
  return config.some((v) => v.name === key);
}

export type EnvBadge = "missing" | "not_in_example" | "secret" | "not_read" | "empty";

/** The badges a row carries, in the order they show. */
export function entryBadges(entry: EnvEntry, config: DevEnvKey[] | undefined): EnvBadge[] {
  const out: EnvBadge[] = [];
  if (entry.missing) out.push("missing");
  if (!entry.in_example) out.push("not_in_example");
  if (entry.secret) out.push("secret");
  if (entry.set && entry.value === "") out.push("empty");
  if (entry.set && readByApp(entry.key, config) === false) out.push("not_read");
  return out;
}

/** The prefix a key belongs to: `APP_LOG_LEVEL` → `APP`, `DATABASE_URL` → `DATABASE`, `PORT` → `PORT`. */
export function keyPrefix(key: string): string {
  const i = key.indexOf("_");
  return i > 0 ? key.slice(0, i) : key;
}

export type EnvGroup = { name: string; entries: EnvEntry[] };

/**
 * Groups entries by their prefix in the order the file lists them, so the
 * table reads like .env.example: APP_* together, then the next family.
 */
export function groupEntries(entries: EnvEntry[]): EnvGroup[] {
  const groups = new Map<string, EnvGroup>();
  for (const e of entries) {
    const name = keyPrefix(e.key);
    let g = groups.get(name);
    if (!g) {
      g = { name, entries: [] };
      groups.set(name, g);
    }
    g.entries.push(e);
  }
  return [...groups.values()];
}

export type EnvShow = "all" | "missing" | "secrets" | "extra";

/** The entries a view shows: those matching `q` (key or description, case-insensitively) and the `show` filter. */
export function filterEntries(entries: EnvEntry[], q: string, show: EnvShow): EnvEntry[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (show === "missing" && !e.missing) return false;
    if (show === "secrets" && !e.secret) return false;
    if (show === "extra" && e.in_example) return false;
    if (words.length === 0) return true;
    const hay = `${e.key} ${e.description ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** How many keys .env.example lists that .env lacks. */
export function missingCount(entries: EnvEntry[]): number {
  return entries.filter((e) => e.missing).length;
}
