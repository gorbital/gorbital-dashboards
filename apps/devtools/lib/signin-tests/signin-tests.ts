/**
 * "Test sign-in" rules, without React: where results land, which route
 * belongs to which method, how checks sum up, what the result page's hash
 * and messages carry, and the words for failure codes.
 */

import type { CheckLink, CheckStatus, SignInCheck, SignInIdentity, SignInMethodKey, SignInPasskey, SignInTestResult, SignInTestState, TOTPTestResult } from "../api/signin-tests";

export type Tone = "ok" | "warn" | "danger" | "info" | "muted";

export const RESULT_PATH = "/auth/test-result/";
export const GUIDE_URL = "https://gorbital.dev/docs/guides/auth-providers";
export const POPUP_FEATURES = "popup,width=520,height=700";
export const POLL_MS = 1500;
export const FINISHED_MESSAGE = "sign-in-test-finished";

const METHOD_KEYS: SignInMethodKey[] = ["google", "apple", "github", "passkeys", "authenticator_app", "email"];

export function isMethodKey(v: string | null | undefined): v is SignInMethodKey {
  return METHOD_KEYS.includes(v as SignInMethodKey);
}

/** The page the provider's round trip ends on, on the portal's own origin. */
export function resultUrl(origin: string): string {
  return origin.replace(/\/+$/, "") + RESULT_PATH;
}

/** The sign-in method a route belongs to, for the Routes screen's link; undefined for routes outside /v1/auth/ or not tied to one method. */
export function methodForRoutePath(path: string): SignInMethodKey | undefined {
  if (path.includes("/google/") || path.endsWith("/google")) return "google";
  if (path.includes("/apple/") || path.endsWith("/apple")) return "apple";
  if (path.includes("/github/") || path.endsWith("/github")) return "github";
  if (path.includes("/passkeys")) return "passkeys";
  if (path.includes("/mfa/totp")) return "authenticator_app";
  return undefined;
}

/** `/auth?tab=tests[&method=…]` for a route under /v1/auth/, or null. */
export function testSignInHref(path: string): string | null {
  if (!path.startsWith("/v1/auth/")) return null;
  const method = methodForRoutePath(path);
  return `/auth?tab=tests${method ? `&method=${method}` : ""}`;
}

/** Where a check's link goes: a console page, or the providers guide. */
export function checkLinkHref(link: CheckLink): { href: string; label: string; external: boolean } {
  switch (link) {
    case "environment":
      return { href: "/environment", label: "Environment", external: false };
    case "tunnel":
      return { href: "/tunnel", label: "Tunnel", external: false };
    case "mail":
      return { href: "/mail", label: "Mail", external: false };
    case "guide":
      return { href: GUIDE_URL, label: "Providers guide", external: true };
  }
}

export function checkTone(status: CheckStatus): Tone {
  return status === "ok" ? "ok" : status === "warn" ? "warn" : status === "fail" ? "danger" : "muted";
}

export type CheckSummary = { ok: number; warn: number; fail: number; skip: number; worst: CheckStatus; label: string };

/** Counts and the worst status: fail over warn over ok over skip. */
export function summarizeChecks(checks: readonly SignInCheck[]): CheckSummary {
  const s = { ok: 0, warn: 0, fail: 0, skip: 0 };
  for (const c of checks) s[c.status] = (s[c.status] ?? 0) + 1;
  const worst: CheckStatus = s.fail ? "fail" : s.warn ? "warn" : s.ok ? "ok" : "skip";
  const parts: string[] = [];
  if (s.fail) parts.push(`${s.fail} failing`);
  if (s.warn) parts.push(`${s.warn} ${s.warn === 1 ? "warning" : "warnings"}`);
  if (s.ok) parts.push(`${s.ok} ok`);
  if (s.skip) parts.push(`${s.skip} skipped`);
  return { ...s, worst, label: parts.length ? parts.join(" · ") : "no checks" };
}

/** Replaces checks by code with newer ones (a re-run of the network checks), keeping order. */
export function mergeChecks(current: readonly SignInCheck[], fresh: readonly SignInCheck[]): SignInCheck[] {
  const byCode = new Map(fresh.map((c) => [c.code, c]));
  const out = current.map((c) => byCode.get(c.code) ?? c);
  for (const c of fresh) if (!current.some((x) => x.code === c.code)) out.push(c);
  return out;
}

/** `#id=…&method=…` from the result page's URL. */
export function parseResultHash(hash: string): { id: string; method?: SignInMethodKey } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const id = params.get("id")?.trim();
  if (!id) return null;
  const method = params.get("method");
  return { id, method: isMethodKey(method) ? method : undefined };
}

export type FinishedMessage = { type: typeof FINISHED_MESSAGE; id: string };

export function finishedMessage(id: string): FinishedMessage {
  return { type: FINISHED_MESSAGE, id };
}

/** The finished test's id from a window or channel message; null for anything else, or from another origin when `origin` is given. */
export function finishedId(data: unknown, origin?: { got: string; want: string }): string | null {
  if (origin && origin.got !== origin.want) return null;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return d.type === FINISHED_MESSAGE && typeof d.id === "string" && d.id ? d.id : null;
}

export function isFinal(state: SignInTestState): boolean {
  return state !== "pending";
}

/** Keep polling while the result is pending and hasn't expired. */
export function shouldPoll(result: Pick<SignInTestResult, "state"> | undefined, expiresAt: string, now: number): boolean {
  if (result && isFinal(result.state)) return false;
  const until = Date.parse(expiresAt);
  return Number.isNaN(until) || now < until;
}

const FAILURES: Record<string, string> = {
  access_denied: "Sign-in was cancelled or refused",
  redirect_uri_mismatch: "The callback URL isn't registered",
  invalid_client: "The client ID or secret is wrong",
  invalid_grant: "The authorization code was refused",
  invalid_request: "The request was malformed",
  unauthorized_client: "This client may not use this flow",
  id_token_signature: "The ID token's signature doesn't verify",
  audience_mismatch: "The ID token is for another client",
  issuer_mismatch: "The ID token comes from another issuer",
  nonce_mismatch: "The nonce doesn't match",
  token_expired: "The token has expired",
  clock_skew: "This machine's clock is off",
  email_not_verified: "The email address isn't verified",
  provider_unreachable: "The provider can't be reached",
  provider_error: "The provider answered with an error",
  github_api_error: "GitHub's API answered with an error",
  rp_id_mismatch: "The passkey is for another RP ID",
  origin_not_allowed: "The origin isn't allowed",
  passkey_cancelled: "The passkey prompt was cancelled",
  passkey_unsupported: "This browser can't create passkeys",
  passkey_invalid: "The passkey response didn't verify",
  expired: "The test expired",
  invalid_code: "Wrong code",
  too_many_attempts: "Too many attempts",
};

/** A short headline for a failure code; the code itself when unknown. */
export function failureLabel(code: string | undefined): string {
  if (!code) return "Failed";
  return FAILURES[code] ?? code.replace(/_/g, " ");
}

export function resultTone(state: SignInTestState): Tone {
  return state === "passed" ? "ok" : state === "failed" ? "danger" : state === "expired" ? "warn" : "info";
}

/** What the result shows about the account: never tokens. */
export function identityRows(identity: SignInIdentity): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = [{ k: "subject", v: identity.subject }];
  if (identity.email) rows.push({ k: "email", v: identity.email });
  rows.push({ k: "email_verified", v: String(identity.email_verified) });
  if (identity.private_email !== undefined) rows.push({ k: "private_email", v: String(identity.private_email) });
  if (identity.name) rows.push({ k: "name", v: identity.name });
  if (identity.audience) rows.push({ k: "audience", v: identity.audience });
  if (identity.hosted_domain) rows.push({ k: "hosted_domain", v: identity.hosted_domain });
  return rows;
}

export function passkeyRows(p: SignInPasskey): { k: string; v: string }[] {
  return [
    { k: "rp_id", v: p.rp_id },
    { k: "origin", v: p.origin },
    { k: "credential_id", v: p.credential_id },
    { k: "user_verified", v: String(p.user_verified) },
    { k: "backup_eligible", v: String(p.backup_eligible) },
    { k: "backup_state", v: String(p.backup_state) },
  ];
}

/** Six digits, spaces ignored. */
export function normalizeTotpCode(raw: string): string | null {
  const code = raw.replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

export function totpHeadline(r: TOTPTestResult): { title: string; tone: Tone } {
  switch (r.code) {
    case "ok":
      return { title: "Passed: the code matches", tone: "ok" };
    case "clock_drift":
      return { title: r.drift_seconds !== undefined ? `The code matches ${Math.abs(r.drift_seconds)} s ${r.drift_seconds < 0 ? "behind" : "ahead"}: the clocks disagree` : "The clocks disagree", tone: "warn" };
    case "invalid_code":
      return { title: "Wrong code", tone: "danger" };
    case "expired":
      return { title: "The test expired: start a new one", tone: "warn" };
    case "too_many_attempts":
      return { title: "Too many attempts: start a new one", tone: "danger" };
  }
}

/** True when the TOTP test can take no more codes. */
export function totpDone(r: TOTPTestResult | undefined): boolean {
  return Boolean(r && (r.passed || r.code === "expired" || r.code === "too_many_attempts" || r.attempts_left <= 0));
}
