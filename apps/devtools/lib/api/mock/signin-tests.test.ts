import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, resetMock } from "./index";
import type { SignInLiveChecks, SignInTestResult, SignInTests, SignInTestStart, TOTPTestResult, TOTPTestStart } from "../signin-tests";
import type { Problem } from "../types";

const H = { "X-Orb-Portal": "1", "Content-Type": "application/json" };
const BASE = "/_portal/app/_dev/auth/test";

/** Awaits a mock request under fake timers: the mock adds latency with setTimeout. */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  void p.finally(() => (done = true)).catch(() => {});
  while (!done) await vi.advanceTimersByTimeAsync(20);
  return p;
}
const get = (path: string) => settle(mockFetch(path));
const post = (path: string, body: unknown = {}) => settle(mockFetch(path, { method: "POST", headers: H, body: JSON.stringify(body) }));
const code = async (res: Response) => ((await res.json()) as Problem).code;

const store = new Map<string, string>();
beforeEach(() => {
  resetMock();
  store.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("test sign-in in mock mode", () => {
  it("lists the methods with their offline checks", async () => {
    const res = await get(BASE);
    expect(res.status).toBe(200);
    const list = (await res.json()) as SignInTests;
    expect(list.public_url).toBe("http://localhost:8080");
    expect(list.methods.map((m) => m.key)).toEqual(["google", "apple", "github", "passkeys", "authenticator_app", "email"]);
    const by = Object.fromEntries(list.methods.map((m) => [m.key, m]));
    expect(by.google).toMatchObject({ configured: true, live: { kind: "redirect", available: true }, id_token: true, callback_url: "http://localhost:8080/v1/auth/google/callback" });
    expect(by.apple).toMatchObject({ configured: true, live: { available: false, link: "tunnel" } });
    expect(by.apple.checks.find((c) => c.code === "apple_public_url_https")).toMatchObject({ status: "fail", link: "tunnel" });
    expect(by.github.configured).toBe(false);
    expect(by.github.checks.flatMap((c) => c.variables ?? [])).toEqual(expect.arrayContaining(["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]));
    expect(by.passkeys).toMatchObject({ rp_id: "localhost", origin: "http://localhost:8080", live: { kind: "ceremony" } });
    expect(by.authenticator_app.live.kind).toBe("code");
    expect(by.email.live.kind).toBe("email");
  });

  it("runs Google's round trip: pending, then passed with an identity", async () => {
    let res = await post(`${BASE}/google/start`, { result_url: "http://127.0.0.1:3100/auth/test-result/" });
    expect(res.status).toBe(201);
    const start = (await res.json()) as SignInTestStart;
    expect(start.url).toMatch(/^https:\/\/accounts\.google\.com\//);
    let r = (await (await get(`${BASE}/results/${start.id}`)).json()) as SignInTestResult;
    expect(r.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(2100);
    r = (await (await get(`${BASE}/results/${start.id}`)).json()) as SignInTestResult;
    expect(r).toMatchObject({ state: "passed", method: "google", kind: "redirect", identity: { email: "ada@example.com", email_verified: true } });
    expect(JSON.stringify(r)).not.toMatch(/token/i);

    res = await get(`${BASE}/results/nope`);
    expect(res.status).toBe(404);
    expect(await code(res)).toBe("test_not_found");
  });

  it("fails Google with redirect_uri_mismatch and invalid_client in the fail demo", async () => {
    store.set("devtoolsSignInTestDemo", "fail");
    const checks = (await (await post(`${BASE}/google/check`)).json()) as SignInLiveChecks;
    expect(checks.checks.find((c) => c.code === "client_credentials")).toMatchObject({ status: "fail" });
    expect(checks.checks.find((c) => c.code === "client_credentials")?.message).toMatch(/invalid_client/);
    const start = (await (await post(`${BASE}/google/start`, { result_url: "http://127.0.0.1:3100/auth/test-result/" })).json()) as SignInTestStart;
    await vi.advanceTimersByTimeAsync(2100);
    const r = (await (await get(`${BASE}/results/${start.id}`)).json()) as SignInTestResult;
    expect(r).toMatchObject({ state: "failed", code: "redirect_uri_mismatch" });
    expect(r.fix).toBeTruthy();
  });

  it("refuses what the app refuses", async () => {
    let res = await post(`${BASE}/apple/start`, { result_url: "http://127.0.0.1:3100/auth/test-result/" });
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("live_test_unavailable");
    res = await post(`${BASE}/github/start`, { result_url: "http://127.0.0.1:3100/auth/test-result/" });
    expect(res.status).toBe(404);
    expect(await code(res)).toBe("not_configured");
    res = await post(`${BASE}/google/start`, { result_url: "javascript:alert(1)" });
    expect(res.status).toBe(422);
    expect(await code(res)).toBe("invalid_result_url");
    for (let i = 0; i < 5; i++) expect((await post(`${BASE}/passkeys/start`, { result_url: "http://127.0.0.1:3100/auth/test-result/" })).status).toBe(201);
    res = await post(`${BASE}/passkeys/start`, { result_url: "http://127.0.0.1:3100/auth/test-result/" });
    expect(res.status).toBe(429);
    expect(await code(res)).toBe("too_many_tests");
    // Writes need the portal header.
    res = await settle(mockFetch(`${BASE}/google/check`, { method: "POST", body: "{}" }));
    expect(res.status).toBe(403);
  });

  it("passes the passkey ceremony with the credential's flags", async () => {
    const start = (await (await post(`${BASE}/passkeys/start`, { result_url: "http://127.0.0.1:3100/auth/test-result/" })).json()) as SignInTestStart;
    expect(start.url.startsWith("http://localhost:8080/")).toBe(true);
    await vi.advanceTimersByTimeAsync(2100);
    const r = (await (await get(`${BASE}/results/${start.id}`)).json()) as SignInTestResult;
    expect(r).toMatchObject({ state: "passed", kind: "ceremony", passkey: { rp_id: "localhost", user_verified: true } });
  });

  it("verifies native ID tokens", async () => {
    let res = await post(`${BASE}/google/id-token`, { id_token: "", nonce: "" });
    expect(res.status).toBe(422);
    expect(await code(res)).toBe("invalid_request");
    let r = (await (await post(`${BASE}/apple/id-token`, { id_token: "a.b.c", nonce: "n-123" })).json()) as SignInTestResult;
    expect(r).toMatchObject({ state: "passed", kind: "id_token", identity: { private_email: true } });
    r = (await (await post(`${BASE}/google/id-token`, { id_token: "garbage", nonce: "" })).json()) as SignInTestResult;
    expect(r).toMatchObject({ state: "failed", code: "id_token_signature" });
    r = (await (await post(`${BASE}/google/id-token`, { id_token: "a.b.c", nonce: "wrong" })).json()) as SignInTestResult;
    expect(r.code).toBe("nonce_mismatch");
    res = await post(`${BASE}/github/id-token`, { id_token: "a.b.c" });
    expect(res.status).toBe(404);
  });

  it("checks authenticator codes: wrong, drifting, right, and five attempts", async () => {
    const start = (await (await post(`${BASE}/totp/start`)).json()) as TOTPTestStart;
    expect(start.qr_code).toMatch(/^data:image\//);
    expect(start.uri).toMatch(/^otpauth:\/\/totp\//);
    const verify = async (c: string) => (await (await post(`${BASE}/totp/verify`, { id: start.id, code: c })).json()) as TOTPTestResult;
    expect(await verify("000000")).toMatchObject({ passed: false, code: "invalid_code", attempts_left: 4 });
    expect(await verify("111111")).toMatchObject({ passed: false, code: "clock_drift", drift_seconds: 90, attempts_left: 3 });
    expect(await verify("424242")).toMatchObject({ passed: true, code: "ok" });

    const again = (await (await post(`${BASE}/totp/start`)).json()) as TOTPTestStart;
    let last: TOTPTestResult | undefined;
    for (let i = 0; i < 5; i++) last = (await (await post(`${BASE}/totp/verify`, { id: again.id, code: "000000" })).json()) as TOTPTestResult;
    expect(last).toMatchObject({ code: "too_many_attempts", attempts_left: 0 });

    const res = await post(`${BASE}/totp/verify`, { id: "missing", code: "123456" });
    expect(res.status).toBe(404);
    expect(await code(res)).toBe("test_not_found");
  });

  it("lists the tests as an extension in the console index", async () => {
    const index = (await (await get("/_portal/app/_dev/")).json()) as { endpoints: string[]; extensions: string[] };
    expect(index.extensions).toEqual(["/_dev/auth/test/"]);
    expect(index.endpoints).not.toContain("/_dev/auth/test");
  });
});
