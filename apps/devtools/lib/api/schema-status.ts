"use client";

/**
 * Live schema status: `GET /_portal/api/db/schema-status` once, then the
 * `schema` events on `/_portal/api/events` keep it current. Every such event
 * also drops the catalog queries (`["db", …]`, the app's migration count,
 * `/ops/system`) so the Tables, SQL, Schema, Objects and Migrations screens
 * refetch on their own when the schema changes from code, from the portal
 * or from the SQL Editor.
 *
 * An orb without the endpoint answers 404: that reads as "healthy, nothing
 * to say" (`null`), never as an error.
 */

import { useSyncExternalStore } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { ApiError, NotConnectedError, apiFetch, normaliseSchemaStatus } from "./client";
import type { AppState, SchemaStatus } from "./types";

export const schemaStatusKey = ["db", "schema-status"] as const;

/** The status, `null` when orb dev has no such endpoint (older orb, no database), undefined while unknown. */
export async function fetchSchemaStatus(): Promise<SchemaStatus | null> {
  try {
    const s = await apiFetch<Partial<SchemaStatus>>("/_portal/api/db/schema-status");
    return normaliseSchemaStatus(s);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) return null;
    throw err;
  }
}

/**
 * Fetched once per page load; after that only the events change it
 * (`applySchemaEvent`). Nothing retries: what won't change by itself
 * (not connected, not signed in, no endpoint) stays as it is until an
 * event says otherwise.
 */
export function useSchemaStatus() {
  return useQuery({
    queryKey: schemaStatusKey,
    queryFn: fetchSchemaStatus,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: (count, err) => !(err instanceof NotConnectedError || err instanceof ApiError) && count < 1,
  });
}

/** Every query that shows the schema, except the status itself (which the event just set). */
export function invalidateSchemaViews(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["db"], predicate: (q) => q.queryKey[1] !== "schema-status" });
  void qc.invalidateQueries({ queryKey: ["dev", "migrations"] });
  void qc.invalidateQueries({ queryKey: ["ops", "system"] });
}

/** A `schema` event landed: the status is the event's, and every view of the schema refetches. */
export function applySchemaEvent(qc: QueryClient, status: SchemaStatus) {
  qc.setQueryData<SchemaStatus | null>(schemaStatusKey, status);
  invalidateSchemaViews(qc);
}

/** A rebuild may have migrated: `building`/`preparing` → `running` refetches the schema views too. */
export function isRebuildFinished(previous: AppState | undefined, next: AppState): boolean {
  return next === "running" && (previous === "building" || previous === "preparing");
}

/* ---------- Toasts ---------- */

export type SchemaToast = { kind: "success" | "info"; title: string; description?: string };

/**
 * What to say, briefly, when a status arrives: applied files after a
 * migrate (from code, a restart or the portal), or a DDL from the SQL
 * Editor. Nothing for `startup`, `code` (the banner says it), a repeat of
 * the same status, or a migrate that applied nothing.
 */
export function schemaToast(status: SchemaStatus, previous?: SchemaStatus | null): SchemaToast | null {
  if (previous && previous.checked_at === status.checked_at && previous.source === status.source) return null;
  if (status.source === "migrate" || status.source === "portal") {
    if (status.applied.length === 0) return null;
    return { kind: "success", title: `Schema updated: applied ${status.applied.join(", ")}`, description: "views refreshed" };
  }
  if (status.source === "sql") return { kind: "info", title: "Schema changed by your SQL; views refreshed" };
  return null;
}

/* ---------- The banner's states ---------- */

export type SchemaNoticeItem =
  | { kind: "problem"; tone: "danger"; message: string }
  | { kind: "pending"; tone: "warn"; files: string[]; outOfOrder: string[] }
  | { kind: "edited"; tone: "warn"; files: string[] };

/**
 * What the banner shows for a status, worst first: the last migrate error,
 * then files in code that orb dev will not apply by itself, then applied
 * files edited since. Empty when there is nothing to warn about.
 */
export function schemaNotices(status: SchemaStatus | null | undefined): SchemaNoticeItem[] {
  if (!status || !status.database) return [];
  const out: SchemaNoticeItem[] = [];
  if (status.problem) out.push({ kind: "problem", tone: "danger", message: status.problem });
  if (status.needs_restart && status.pending.length > 0) {
    out.push({ kind: "pending", tone: "warn", files: status.pending.map((p) => p.file), outOfOrder: status.pending.filter((p) => p.reason === "out_of_order").map((p) => p.file) });
  }
  if (status.edited.length > 0) out.push({ kind: "edited", tone: "warn", files: status.edited.map((e) => e.file) });
  return out;
}

/** "1 migration in code is not applied: `a.sql`. Restart the app to apply it." */
export function pendingSentence(files: string[]): { lead: string; tail: string } {
  const n = files.length;
  return { lead: `${n} migration${n === 1 ? "" : "s"} in code ${n === 1 ? "is" : "are"} not applied:`, tail: `Restart the app to apply ${n === 1 ? "it" : "them"}.` };
}

/** The files in `list` an entry names, by file name (`edited[].file`) against a migration's path. */
export function namesFile(files: { file: string }[], path: string): boolean {
  if (!path) return false;
  const name = path.slice(path.lastIndexOf("/") + 1);
  return files.some((f) => f.file === name || f.file === path);
}

/* ---------- Dismissal, shared by every screen ---------- */

let dismissedAt: string | undefined;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Dismissed for this `checked_at` only: the next status brings the banner back. */
export function dismissSchemaNotice(checkedAt: string) {
  dismissedAt = checkedAt;
  for (const l of listeners) l();
}

/** Tests and the mock's reset. */
export function resetSchemaNoticeDismissal() {
  dismissedAt = undefined;
  for (const l of listeners) l();
}

/** Dismissed for exactly this status; a new `checked_at` shows the banner again. */
export function isSchemaNoticeDismissed(checkedAt: string | undefined): boolean {
  return Boolean(checkedAt) && dismissedAt === checkedAt;
}

export function useSchemaNoticeDismissed(checkedAt: string | undefined): boolean {
  const at = useSyncExternalStore(
    subscribe,
    () => dismissedAt,
    () => undefined,
  );
  return Boolean(checkedAt) && at === checkedAt;
}
