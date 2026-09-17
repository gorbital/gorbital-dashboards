/**
 * The Migrations page's pure parts: ordering, the header tiles' numbers,
 * which migration a roll-back would hit, and the badges a row shows.
 */
import type { Migration } from "@/lib/api/schema";

/** Newest first, by version; the backend lists oldest first. */
export function newestFirst(list: Migration[]): Migration[] {
  return [...list].sort((a, b) => b.version - a.version);
}

export type MigrationSummary = {
  /** The highest applied version, 0 when none. */
  current: number;
  /** The highest version on disk, 0 when none. */
  latest: number;
  applied: number;
  pending: number;
  /** Files not applied yet, oldest first: what `migrate` would run. */
  pendingList: Migration[];
  /** The most recently applied migration: what `migrate-down` would roll back. */
  last?: Migration;
  /** Applied versions with no file on disk (the table remembers them, the tree doesn't). */
  orphans: Migration[];
};

export function summarise(list: Migration[]): MigrationSummary {
  const applied = list.filter((m) => m.applied);
  const pendingList = list.filter((m) => !m.applied).sort((a, b) => a.version - b.version);
  const last = applied.length ? applied.reduce((a, b) => (b.version > a.version ? b : a)) : undefined;
  return {
    current: last?.version ?? 0,
    latest: list.length ? Math.max(...list.map((m) => m.version)) : 0,
    applied: applied.length,
    pending: pendingList.length,
    pendingList,
    last,
    orphans: applied.filter((m) => !m.path),
  };
}

export type MigrationBadge = "pending" | "applied" | "no-down" | "orphan";

/** The badges a row shows, in order. */
export function badgesFor(m: Migration): MigrationBadge[] {
  const out: MigrationBadge[] = [m.applied ? "applied" : "pending"];
  if (!m.path) out.push("orphan");
  else if (!m.has_down) out.push("no-down");
  return out;
}

/** `20260916000001` as `2026-09-16 · 000001`, so versions scan as dates. */
export function formatVersion(version: number): string {
  const s = String(version);
  if (s.length !== 14) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} · ${s.slice(8)}`;
}

/** The Up and Down sections of a goose file, for the expanded row. */
export function splitSections(sql: string): { up: string; down: string | null; noTransaction: boolean } {
  const noTransaction = /\+goose NO TRANSACTION/i.test(sql);
  const upAt = sql.search(/-- \+goose Up/i);
  const downAt = sql.search(/-- \+goose Down/i);
  if (upAt < 0) return { up: sql.trim(), down: null, noTransaction };
  const up = sql.slice(upAt, downAt >= 0 ? downAt : undefined).replace(/^-- \+goose Up\s*/i, "").trim();
  const down = downAt >= 0 ? sql.slice(downAt).replace(/^-- \+goose Down\s*/i, "").trim() : null;
  return { up, down, noTransaction };
}
