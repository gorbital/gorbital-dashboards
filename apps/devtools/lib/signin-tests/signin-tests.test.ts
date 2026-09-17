import { describe, expect, it } from "vitest";
import type { SignInCheck, TOTPTestResult } from "../api/signin-tests";
import {
  checkLinkHref,
  checkTone,
  failureLabel,
  finishedId,
  finishedMessage,
  identityRows,
  mergeChecks,
  methodForRoutePath,
  normalizeTotpCode,
  parseResultHash,
  resultUrl,
  shouldPoll,
  summarizeChecks,
  testSignInHref,
  totpDone,
  totpHeadline,
} from "./signin-tests";

const check = (code: string, status: SignInCheck["status"]): SignInCheck => ({ code, status, message: code });

describe("test sign-in rules", () => {
  it("builds the result URL on the portal's origin", () => {
    expect(resultUrl("http://127.0.0.1:3100")).toBe("http://127.0.0.1:3100/auth/test-result/");
    expect(resultUrl("http://localhost:3187/")).toBe("http://localhost:3187/auth/test-result/");
  });

  it("maps routes to methods", () => {
    expect(methodForRoutePath("/v1/auth/google/start")).toBe("google");
    expect(methodForRoutePath("/v1/auth/apple/callback")).toBe("apple");
    expect(methodForRoutePath("/v1/auth/github/callback")).toBe("github");
    expect(methodForRoutePath("/v1/auth/passkeys/login/begin")).toBe("passkeys");
    expect(methodForRoutePath("/v1/auth/passkeys")).toBe("passkeys");
    expect(methodForRoutePath("/v1/auth/mfa/totp/enroll")).toBe("authenticator_app");
    expect(methodForRoutePath("/v1/auth/login")).toBeUndefined();
    expect(testSignInHref("/v1/auth/google/callback")).toBe("/auth?tab=tests&method=google");
    expect(testSignInHref("/v1/auth/mfa/totp/verify")).toBe("/auth?tab=tests&method=authenticator_app");
    expect(testSignInHref("/v1/auth/login")).toBe("/auth?tab=tests");
    expect(testSignInHref("/v1/users/google/x")).toBeNull();
  });

  it("links checks to console pages and the guide", () => {
    expect(checkLinkHref("environment")).toMatchObject({ href: "/environment", external: false });
    expect(checkLinkHref("tunnel").href).toBe("/tunnel");
    expect(checkLinkHref("mail").href).toBe("/mail");
    expect(checkLinkHref("guide")).toMatchObject({ href: "https://gorbital.dev/docs/guides/auth-providers", external: true });
  });

  it("sums up checks", () => {
    expect(summarizeChecks([])).toMatchObject({ worst: "skip", label: "no checks" });
    expect(summarizeChecks([check("a", "ok"), check("b", "ok")])).toMatchObject({ ok: 2, worst: "ok", label: "2 ok" });
    expect(summarizeChecks([check("a", "ok"), check("b", "warn"), check("c", "skip")])).toMatchObject({ worst: "warn", label: "1 warning · 1 ok · 1 skipped" });
    expect(summarizeChecks([check("a", "warn"), check("b", "fail"), check("c", "fail")])).toMatchObject({ worst: "fail", label: "2 failing · 1 warning" });
    expect(checkTone("fail")).toBe("danger");
    expect(checkTone("skip")).toBe("muted");
  });

  it("merges fresh checks by code", () => {
    const merged = mergeChecks([check("a", "ok"), check("b", "fail")], [check("b", "ok"), check("c", "warn")]);
    expect(merged.map((c) => `${c.code}:${c.status}`)).toEqual(["a:ok", "b:ok", "c:warn"]);
  });

  it("reads the result page's hash", () => {
    expect(parseResultHash("#id=sit_1&method=google")).toEqual({ id: "sit_1", method: "google" });
    expect(parseResultHash("#id=sit_2&method=bogus")).toEqual({ id: "sit_2", method: undefined });
    expect(parseResultHash("")).toBeNull();
    expect(parseResultHash("#method=google")).toBeNull();
  });

  it("accepts finished messages only from the same origin", () => {
    const msg = finishedMessage("sit_1");
    expect(finishedId(msg)).toBe("sit_1");
    expect(finishedId(msg, { got: "http://127.0.0.1:3100", want: "http://127.0.0.1:3100" })).toBe("sit_1");
    expect(finishedId(msg, { got: "https://evil.example", want: "http://127.0.0.1:3100" })).toBeNull();
    expect(finishedId({ type: "other", id: "x" })).toBeNull();
    expect(finishedId({ type: "sign-in-test-finished", id: 3 })).toBeNull();
    expect(finishedId("sign-in-test-finished")).toBeNull();
  });

  it("polls until final or expired", () => {
    const exp = "2026-09-17T12:10:00Z";
    const before = Date.parse("2026-09-17T12:00:00Z");
    expect(shouldPoll(undefined, exp, before)).toBe(true);
    expect(shouldPoll({ state: "pending" }, exp, before)).toBe(true);
    expect(shouldPoll({ state: "passed" }, exp, before)).toBe(false);
    expect(shouldPoll({ state: "pending" }, exp, Date.parse(exp) + 1)).toBe(false);
  });

  it("labels failure codes", () => {
    expect(failureLabel("redirect_uri_mismatch")).toMatch(/callback URL/);
    expect(failureLabel("invalid_client")).toMatch(/client ID/);
    expect(failureLabel("something_new")).toBe("something new");
    expect(failureLabel(undefined)).toBe("Failed");
  });

  it("shows an identity without tokens", () => {
    const rows = identityRows({ subject: "s1", email: "ada@example.com", email_verified: false, private_email: true, audience: "aud" });
    expect(rows.map((r) => r.k)).toEqual(["subject", "email", "email_verified", "private_email", "audience"]);
    expect(rows.find((r) => r.k === "email_verified")?.v).toBe("false");
  });

  it("handles authenticator codes and outcomes", () => {
    expect(normalizeTotpCode(" 123 456 ")).toBe("123456");
    expect(normalizeTotpCode("12345")).toBeNull();
    expect(normalizeTotpCode("abcdef")).toBeNull();
    const r = (p: Partial<TOTPTestResult>): TOTPTestResult => ({ passed: false, code: "invalid_code", message: "", attempts_left: 4, ...p });
    expect(totpHeadline(r({ code: "clock_drift", drift_seconds: 90 }))).toMatchObject({ tone: "warn", title: expect.stringMatching(/90 s ahead/) });
    expect(totpHeadline(r({ code: "clock_drift", drift_seconds: -60 })).title).toMatch(/60 s behind/);
    expect(totpHeadline(r({ passed: true, code: "ok" })).tone).toBe("ok");
    expect(totpDone(undefined)).toBe(false);
    expect(totpDone(r({}))).toBe(false);
    expect(totpDone(r({ passed: true, code: "ok" }))).toBe(true);
    expect(totpDone(r({ code: "too_many_attempts", attempts_left: 0 }))).toBe(true);
  });
});
