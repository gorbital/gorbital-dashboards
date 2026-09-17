import type { RunMode } from "../api/sql";

/**
 * The buffer survives a reload: it goes to localStorage under the app's
 * name, so two apps on the same origin keep their own. Storage can be
 * blocked or full; every access is guarded and a failure is silent.
 */

export type Draft = {
  sql: string;
  /** The snippet the buffer came from, when it did. */
  snippet?: string;
  mode?: RunMode;
  savedAt: string;
};

export const draftKey = (app: string) => `devtools.sql.draft.${app || "app"}`;

export function loadDraft(app: string): Draft | undefined {
  try {
    const raw = localStorage.getItem(draftKey(app));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.sql !== "string") return undefined;
    return { sql: parsed.sql, snippet: typeof parsed.snippet === "string" ? parsed.snippet : undefined, mode: parsed.mode, savedAt: String(parsed.savedAt ?? "") };
  } catch {
    return undefined;
  }
}

export function saveDraft(app: string, draft: Omit<Draft, "savedAt">) {
  try {
    if (!draft.sql.trim() && !draft.snippet) {
      localStorage.removeItem(draftKey(app));
      return;
    }
    localStorage.setItem(draftKey(app), JSON.stringify({ ...draft, savedAt: new Date().toISOString() } satisfies Draft));
  } catch {
    // Storage blocked or full: the draft just isn't kept.
  }
}

export function clearDraft(app: string) {
  try {
    localStorage.removeItem(draftKey(app));
  } catch {
    // Nothing to do.
  }
}
