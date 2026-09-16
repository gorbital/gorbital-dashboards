/** The Authentication screen's pure logic: paging, roles, codes and limiter keys, testable without React. */

import type { OpsCode, OpsUser, OpsUserList, RateLimiter } from "./api/auth";
import type { DevPermissionCatalog } from "./api/types";

/**
 * Flattens the pages of `useAuthUsers` into one list, newest first, keeping
 * the first appearance of an account: a page refetched after a create or a
 * delete can overlap the next one at the cursor.
 */
export function mergeUserPages(pages: OpsUserList[] | undefined): OpsUser[] {
  const seen = new Set<string>();
  const out: OpsUser[] = [];
  for (const page of pages ?? []) {
    for (const u of page.users ?? []) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      out.push(u);
    }
  }
  return out;
}

/** The built-in role every account holds; the app refuses to grant or revoke it. */
export const implicitRole = "user";

export type RoleOption = { name: string; description: string; catalog: string };

/**
 * The roles an operator can still grant: every role of every permission
 * catalog the app declares (`/_dev/app`), minus the implicit `user` role and
 * those the account already holds. Catalog order is kept; duplicates across
 * catalogs are listed once.
 */
export function grantableRoles(catalogs: DevPermissionCatalog[] | undefined, held: string[]): RoleOption[] {
  const have = new Set([implicitRole, ...held]);
  const out: RoleOption[] = [];
  for (const c of catalogs ?? []) {
    for (const r of c.roles ?? []) {
      if (have.has(r.name)) continue;
      have.add(r.name);
      out.push({ name: r.name, description: r.description, catalog: c.name });
    }
  }
  return out;
}

/** The roles the operator can revoke: what the account holds, without the implicit one. */
export function revocableRoles(held: string[]): string[] {
  return held.filter((r) => r !== implicitRole);
}

export type CodeState = { state: "usable" | "expired" | "spent"; label: string; tone: "ok" | "warn" | "danger" | "muted" };

/** A short duration: `45s`, `9m`, `2h`, `3d`. */
function short(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}

/**
 * What a verification or reset code is worth right now: usable (with what's
 * left), spent (every attempt used) or expired. `now` is 0 before the client
 * has a clock, and then the label says only which it is.
 */
export function codeState(code: Pick<OpsCode, "attempts" | "max_attempts" | "expires_at">, now: number): CodeState {
  if (code.max_attempts > 0 && code.attempts >= code.max_attempts) return { state: "spent", label: "no attempts left", tone: "danger" };
  const exp = Date.parse(code.expires_at);
  if (!now || Number.isNaN(exp)) return { state: "usable", label: "usable", tone: "ok" };
  if (exp <= now) return { state: "expired", label: `expired ${short(now - exp)} ago`, tone: "muted" };
  const left = exp - now;
  return { state: "usable", label: `expires in ${short(left)}`, tone: left < 2 * 60_000 ? "warn" : "ok" };
}

/** Words for a code's purpose. */
export function codePurpose(purpose: string): string {
  return { verify_email: "verify email", reset_password: "reset password" }[purpose] ?? purpose.replace(/_/g, " ");
}

/**
 * An example key for a limiter, from how the app describes its keys: an IP
 * address, an email address, a user or actor ID, or the two joined with a
 * space. It seeds the placeholder of the reset form, never the value.
 */
export function limiterKeyExample(limiter: Pick<RateLimiter, "keys">): string {
  const k = limiter.keys.toLowerCase();
  const parts: string[] = [];
  if (k.includes("purpose")) parts.push("verify_email");
  if (k.includes("email")) parts.push("ada@example.com");
  if (k.includes("network")) parts.push("203.0.113.0/24");
  else if (k.includes("ip address") || (k.includes("address") && parts.length === 0)) parts.push("203.0.113.9");
  if (k.includes("user id") || k.includes("actor id")) parts.push("usr_3frf6yknqvo4wx5ar5ut5pof4a");
  return parts.length ? parts.join(" ") : "the key as the limiter sees it";
}

/** The account's newest session, by last activity, for a "last seen" column. */
export function lastSeen(sessions: { last_seen_at: string }[]): string | undefined {
  let best: string | undefined;
  for (const s of sessions) if (!best || Date.parse(s.last_seen_at) > Date.parse(best)) best = s.last_seen_at;
  return best;
}
